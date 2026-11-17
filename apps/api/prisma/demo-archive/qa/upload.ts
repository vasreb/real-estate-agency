import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDatabase } from "../../../src/infrastructure/database/index.js";
import { createApp } from "../../../src/app.js";
import { preflightArchive } from "../persistence/preflight.js";
import { readPasswords, hashPasswords } from "../persistence/credentials.js";
import {
  evidenceRoot,
  ownedOutputPath,
  limits,
  assertOfflineEnvironment,
} from "../policy.js";
import { stableJson, type DocumentRecord } from "../model.js";
import { assertStoredBytes } from "../persistence/compare.js";

assertOfflineEnvironment(process.env);
const name = process.env.DEMO_ARCHIVE_SCRATCH_DB;
const url = new URL(process.env.DATABASE_URL ?? "invalid");
if (
  !/^agency_archive_scratch_[a-f0-9]{12}$/.test(name ?? "") ||
  url.pathname !== `/${name}` ||
  url.username !== name ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "55433" ||
  url.search ||
  url.hash
)
  throw new Error("Dedicated scratch-only target required.");
const passwords = readPasswords(process.env);
const hashes = await hashPasswords(passwords);
const release = JSON.parse(
  await readFile(path.join(evidenceRoot, "release-receipt.json"), "utf8"),
) as { zip_sha256: string };
const archive = await preflightArchive(
  ownedOutputPath("out/agency-demo-archive-v1.zip"),
  release.zip_sha256,
);
const db = createDatabase(url.href);
try {
  const identity = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT current_database() AS name",
  );
  if (
    identity[0]?.name !== name ||
    (await db.user.count()) ||
    (await db.document.count())
  )
    throw new Error("Scratch is not fresh and empty.");
  const e = archive.corpus.entities;
  await db.$transaction(async (tx) => {
    for (const row of e.teams) await tx.team.create({ data: row });
    for (const [i, row] of e.users.entries())
      await tx.user.create({ data: { ...row, passwordHash: hashes[i]! } });
    for (const row of e.team_members)
      await tx.teamMember.create({
        data: { teamId: row.team_id, userId: row.user_id, role: row.role },
      });
    for (const row of e.clients) await tx.client.create({ data: row });
    for (const row of e.properties) await tx.property.create({ data: row });
    for (const row of e.deals)
      await tx.deal.create({
        data: {
          id: row.id,
          number: row.number,
          type: row.type,
          teamId: row.team_id,
          propertyId: row.property_id,
          clientId: row.client_id,
        },
      });
  });
  const origin = "http://127.0.0.1:35533";
  const app = createApp(
    {
      NODE_ENV: "test",
      DATABASE_URL: url.href,
      PUBLIC_ORIGIN: origin,
      API_HOST: "127.0.0.1",
      API_PORT: 35533,
      SESSION_TTL_SECONDS: 28800,
      LOG_LEVEL: "silent",
      TRUSTED_PROXIES: [],
    },
    { database: db },
  );
  try {
    const cookies: string[] = [];
    for (const [i, user] of e.users.entries()) {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin },
        payload: { email: user.email, password: passwords[i]! },
      });
      const cookie = login.cookies.find((c) => c.name === "agency_session");
      if (login.statusCode !== 204 || !cookie)
        throw new Error("Scratch login failed.");
      cookies.push(`agency_session=${cookie.value}`);
    }
    const ops = archive.corpus.staff.findIndex(
      (s) => s.key === "operations-lead",
    );
    const adminCookie = cookies[ops]!;
    const uploaded = new Map<string, string>();
    const fileRoot = ownedOutputPath("out/agency-demo-archive/v1");
    const upload = async (
      row: DocumentRecord,
      overrides: Record<string, string> = {},
      cookie = adminCookie,
    ) => {
      const bytes = await readFile(path.join(fileRoot, row.path));
      assertStoredBytes(bytes, row);
      const form = new FormData();
      const m = row.mapped;
      const fields: Record<string, string | null> = {
        title: m.title,
        type: m.type,
        document_number: m.document_number,
        document_date: m.document_date,
        effective_from: m.effective_from,
        status: m.status,
        parent_document_id: m.parent_document_id
          ? (uploaded.get(m.parent_document_id) ?? null)
          : null,
        ...overrides,
      };
      for (const [key, value] of Object.entries(fields))
        if (value !== null) form.set(key, value);
      form.set(
        "file",
        new Blob([Uint8Array.from(bytes)], { type: m.mime_type }),
        m.file_name,
      );
      const request = new Request(origin, { method: "POST", body: form });
      return app.inject({
        method: "POST",
        url: `/api/deals/${m.deal_id}/documents`,
        headers: {
          origin,
          cookie,
          "content-type": request.headers.get("content-type")!,
        },
        payload: Buffer.from(await request.arrayBuffer()),
      });
    };
    const start = performance.now();
    let pdf = 0;
    let docx = 0;
    const ordered = [...archive.documents].sort(
      (a, b) =>
        Number(a.mapped.type === "amendment") -
        Number(b.mapped.type === "amendment"),
    );
    for (const row of ordered) {
      const response = await upload(row);
      if (response.statusCode !== 201)
        throw new Error(
          `Production upload refused ${row.key} (${row.family}) with status ${response.statusCode}.`,
        );
      const result = response.json<{ id: string }>();
      uploaded.set(row.mapped.id, result.id);
      const downloaded = await app.inject({
        method: "GET",
        url: `/api/documents/${result.id}/file`,
        headers: { cookie: adminCookie },
      });
      if (
        downloaded.statusCode !== 200 ||
        createHash("sha256").update(downloaded.rawPayload).digest("hex") !==
          row.sha256
      )
        throw new Error(`Scratch download differs: ${row.key}`);
      if (row.mapped.mime_type === "application/pdf") pdf++;
      else docx++;
      if (process.memoryUsage().rss > limits.rss_bytes)
        throw new Error("Scratch API verification RSS exceeded.");
    }
    const member = archive.corpus.staff.findIndex(
      (s) => s.key === "north-sales-agent-1",
    );
    const sale = archive.documents.find((r) =>
      e.deals.some(
        (d) =>
          d.id === r.mapped.deal_id &&
          d.type === "sale" &&
          e.teams.find((t) => t.id === d.team_id)?.name ===
            "North London Sales",
      ),
    )!;
    const memberUpload = await upload(sale, {}, cookies[member]);
    if (memberUpload.statusCode !== 403)
      throw new Error("Scratch member mutation was not forbidden.");
    const linked = archive.documents.find((r) => r.mapped.parent_document_id)!;
    const parentId = uploaded.get(linked.mapped.parent_document_id!)!;
    const referencedDelete = await app.inject({
      method: "DELETE",
      url: `/api/documents/${parentId}`,
      headers: { origin, cookie: adminCookie },
    });
    if (referencedDelete.statusCode !== 409)
      throw new Error("Referenced parent deletion did not return 409.");
    const foreign = archive.documents.find(
      (r) =>
        r.mapped.type === "contract" &&
        r.mapped.deal_id !== linked.mapped.deal_id,
    )!;
    const invalid = await upload(linked, {
      parent_document_id: uploaded.get(foreign.mapped.id)!,
    });
    if (invalid.statusCode !== 400)
      throw new Error("Cross-deal amendment parent was accepted.");
    if ((await db.document.count()) !== 2400)
      throw new Error("Rejected scratch mutations changed document counts.");
    await writeFile(
      path.join(evidenceRoot, "task-17-upload-parity.json"),
      stableJson({
        zip_sha256: release.zip_sha256,
        source_digest: archive.receipt.source_digest,
        scratch_database: name,
        main_database_mutations: 0,
        actual_production_uploads: uploaded.size,
        byte_exact_downloads: uploaded.size,
        pdf,
        docx,
        member_mutation: memberUpload.statusCode,
        referenced_parent_delete: referencedDelete.statusCode,
        cross_deal_parent: invalid.statusCode,
        elapsed_ms: Math.round(performance.now() - start),
        process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
        native_office_layout: "unverified",
      }),
    );
  } finally {
    await app.close();
  }
} finally {
  await db.$disconnect();
}
