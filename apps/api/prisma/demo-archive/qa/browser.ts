import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { createDatabase } from "../../../src/infrastructure/database/index.js";
import { createApp } from "../../../src/app.js";
import { preflightArchive } from "../persistence/preflight.js";
import { importVerified } from "../persistence/import.js";
import { evidenceRoot, workspaceRoot, ownedOutputPath } from "../policy.js";
import { stableJson } from "../model.js";

const role = process.env.DEMO_ARCHIVE_QA_ROLE;
const container = process.env.DEMO_ARCHIVE_CONTAINER;
const url = new URL(process.env.DATABASE_URL ?? "invalid");
if (
  !/^agency_archive_qa_[a-f0-9]{12}$/.test(role ?? "") ||
  !/^[a-f0-9]{64}$/.test(container ?? "") ||
  url.username !== role ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "55433" ||
  url.pathname !== "/agency_demo_archive" ||
  url.search ||
  url.hash
)
  throw new Error("Explicit approved read-only QA role required.");
const release = JSON.parse(
  await readFile(path.join(evidenceRoot, "release-receipt.json"), "utf8"),
) as { zip_sha256: string };
const input = ownedOutputPath("out/agency-demo-archive-v1.zip");
const archive = await preflightArchive(input, release.zip_sha256);
const db = createDatabase(url.href);
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const owner =
  archive.corpus.entities.users[
    archive.corpus.staff.findIndex((s) => s.key === "operations-lead")
  ]!.id;
const peer = (sql: string) => {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "--interactive",
      container!,
      "psql",
      "-X",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "agency_archive",
      "--dbname",
      "agency_demo_archive",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (r.status !== 0)
    throw new Error("Scoped QA-session administration failed.");
};
let web: ReturnType<typeof spawn> | undefined;
let app: ReturnType<typeof createApp> | undefined;
let sessionCreated = false;
let preservationFailed: boolean;
const passwordsBefore = await db.user.findMany({
  select: { id: true, passwordHash: true },
  orderBy: { id: "asc" },
});
const sessionsBefore = await db.session.findMany({
  orderBy: { tokenHash: "asc" },
});
try {
  const guard = await db.$queryRawUnsafe<{ writable: boolean }[]>(
    "SELECT has_table_privilege(current_user, 'documents', 'INSERT') AS writable",
  );
  if (guard[0]?.writable)
    throw new Error("QA database role must not mutate corpus tables.");
  const unusedHashes = Array.from(
    { length: 10 },
    () => "unused-existing-account-hash",
  );
  const concurrent = await Promise.all([
    importVerified(db, archive, input, release.zip_sha256, unusedHashes),
    importVerified(db, archive, input, release.zip_sha256, unusedHashes),
  ]);
  if (
    concurrent.some(
      (r) =>
        !r.noop || r.writes !== 0 || r.compared_existing_originals !== 2400,
    )
  )
    throw new Error("Concurrent exact reruns did not serialize as no-ops.");
  const conflicts: string[] = [];
  for (const kind of ["title", "email", "role", "bytes", "parent"] as const) {
    const altered = {
      ...archive,
      corpus: { ...archive.corpus, entities: { ...archive.corpus.entities } },
      documents: archive.documents.map((r) => ({
        ...r,
        mapped: { ...r.mapped },
      })),
    };
    if (kind === "title") altered.documents[0]!.mapped.title += " conflict";
    if (kind === "email")
      altered.corpus.entities.users = archive.corpus.entities.users.map(
        (r, i) =>
          i ? r : { ...r, email: "conflict@northbridge-vale.example" },
      );
    if (kind === "role")
      altered.corpus.entities.team_members =
        archive.corpus.entities.team_members.map((r, i) =>
          i ? r : { ...r, role: r.role === "admin" ? "member" : "admin" },
        );
    if (kind === "bytes") altered.documents[0]!.sha256 = "0".repeat(64);
    if (kind === "parent")
      altered.documents.find(
        (r) => r.mapped.parent_document_id,
      )!.mapped.parent_document_id = altered.documents.at(-1)!.mapped.id;
    let rejected = false;
    try {
      await importVerified(
        db,
        altered,
        input,
        release.zip_sha256,
        unusedHashes,
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Conflict not rejected: ${kind}`);
    conflicts.push(kind);
  }
  await writeFile(
    path.join(evidenceRoot, "task-17-concurrency-conflicts.json"),
    stableJson({
      zip_sha256: release.zip_sha256,
      concurrent_exact_reruns: concurrent,
      conflicts_rejected: conflicts,
      execution_role: "approved SELECT-only temporary QA role",
      writes: 0,
      note: "Lower-level transaction/compare adapter exercised on main; CLI target/credential guards are separately tested, not bypassed as a production import claim.",
    }),
  );
  peer(
    `INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('${tokenHash}','${owner}',now()+interval '1 hour');`,
  );
  sessionCreated = true;
  app = createApp(
    {
      NODE_ENV: "test",
      DATABASE_URL: url.href,
      PUBLIC_ORIGIN: "http://127.0.0.1:35534",
      API_HOST: "127.0.0.1",
      API_PORT: 35533,
      LOG_LEVEL: "silent",
      TRUSTED_PROXIES: ["127.0.0.1"],
      SESSION_TTL_SECONDS: 3600,
    },
    { database: db },
  );
  await app.listen({ host: "127.0.0.1", port: 35533 });
  web = spawn(
    process.execPath,
    [
      path.join(workspaceRoot, "apps/web/server.mjs"),
      "--hostname",
      "127.0.0.1",
      "--port",
      "35534",
    ],
    {
      cwd: path.join(workspaceRoot, "apps/web"),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    },
  );
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (web.exitCode !== null) throw new Error("Owned web server exited.");
    try {
      await fetch("http://127.0.0.1:35534/login");
      ready = true;
      break;
    } catch {
      await setTimeout(200);
    }
  }
  if (!ready) throw new Error("Owned browser server readiness failed.");
  await new Promise<void>((resolve, reject) => {
    const runner = spawn(
      process.execPath,
      [path.join(workspaceRoot, "tooling/demo-archive/browser-pages.mjs")],
      {
        cwd: workspaceRoot,
        env: { ...process.env, DEMO_ARCHIVE_QA_COOKIE: token },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let diagnostic = "";
    runner.stderr.on("data", (data: Buffer) => {
      if (diagnostic.length < 4000) diagnostic += data.toString();
    });
    runner.once("error", () =>
      reject(new Error("Browser runner did not start.")),
    );
    runner.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Browser traversal failed: ${diagnostic.replaceAll(token, "[REDACTED]").slice(0, 1500)}`,
            ),
          ),
    );
  });
} finally {
  if (web && web.exitCode === null) {
    web.kill();
    await Promise.race([
      new Promise<void>((resolve) => web!.once("exit", () => resolve())),
      setTimeout(5000),
    ]);
    if (web.exitCode === null) web.kill("SIGKILL");
  }
  await app?.close();
  if (sessionCreated)
    peer(
      `DELETE FROM sessions WHERE token_hash='${tokenHash}' AND user_id='${owner}';`,
    );
  const passwordsAfter = await db.user.findMany({
    select: { id: true, passwordHash: true },
    orderBy: { id: "asc" },
  });
  const sessionsAfter = await db.session.findMany({
    orderBy: { tokenHash: "asc" },
  });
  await db.$disconnect();
  preservationFailed =
    stableJson(passwordsBefore) !== stableJson(passwordsAfter) ||
    stableJson(sessionsBefore) !== stableJson(sessionsAfter);
  await writeFile(
    path.join(evidenceRoot, "task-18-session-cleanup.json"),
    stableJson({
      temporary_session_removed: true,
      existing_password_hashes_preserved: !preservationFailed,
      existing_session_rows_preserved: !preservationFailed,
      token_recorded: false,
      origin:
        "Explicit user-approved authenticated QA fixture; not a new login or signature verification claim",
    }),
  );
}
if (preservationFailed)
  throw new Error("Existing credentials/sessions changed during approved QA.");
const peak = process.resourceUsage().maxRSS * 1024;
if (peak > 1024 ** 3)
  throw new Error("QA API/validation peak RSS exceeds policy.");
await writeFile(
  path.join(evidenceRoot, "task-18-runtime.json"),
  stableJson({
    zip_sha256: release.zip_sha256,
    process_max_rss_bytes: peak,
    existing_passwords_and_sessions_preserved: true,
  }),
);
