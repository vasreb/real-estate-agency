import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDatabase } from "../../../src/infrastructure/database/index.js";
import { createApp } from "../../../src/app.js";
import {
  resolveImportTarget,
  verifyOwnedTarget,
} from "../persistence/target.js";
import { readPasswords, hashPasswords } from "../persistence/credentials.js";
import { preflightArchive } from "../persistence/preflight.js";
import { importVerified } from "../persistence/import.js";
import { evidenceRoot, ownedOutputPath, limits } from "../policy.js";
import { stableJson } from "../model.js";
import { assertStoredBytes, storedMetadata } from "../persistence/compare.js";

const phase = process.argv.slice(2).join(" ");
if (!["--phase rollback", "--phase verify"].includes(phase))
  throw new Error("Unknown dedicated integration phase.");
const target = resolveImportTarget(process.env, "agency_demo_archive");
const passwords = readPasswords(process.env);
const release = JSON.parse(
  await readFile(path.join(evidenceRoot, "release-receipt.json"), "utf8"),
) as { zip_sha256: string };
const input = ownedOutputPath("out/agency-demo-archive-v1.zip");
const archive = await preflightArchive(input, release.zip_sha256);
const proof = verifyOwnedTarget(
  target,
  archive.receipt.source_digest,
  archive.receipt.original_bytes,
);
const hashes = await hashPasswords(passwords);
const db = createDatabase(target.databaseUrl);
try {
  if (phase === "--phase rollback") {
    if (
      (await db.document.count()) ||
      (await db.user.count()) ||
      (await db.team.count())
    )
      throw new Error("Rollback phase requires the fresh empty target.");
    let rejected = false;
    try {
      await importVerified(db, archive, input, release.zip_sha256, hashes, 30);
    } catch {
      rejected = true;
    }
    const counts = await Promise.all([
      db.team.count(),
      db.user.count(),
      db.teamMember.count(),
      db.client.count(),
      db.property.count(),
      db.deal.count(),
      db.document.count(),
    ]);
    if (!rejected || counts.some((n) => n !== 0))
      throw new Error("Injected import did not roll back every table.");
    // Exact partial completion fixture: additive matching rows in this new DB,
    // before the real import. No reset/delete/repair of existing data.
    await db.team.create({ data: archive.corpus.entities.teams[0]! });
    await db.client.create({ data: archive.corpus.entities.clients[0]! });
    await writeFile(
      path.join(evidenceRoot, "task-17-rollback.json"),
      stableJson({
        zip_sha256: release.zip_sha256,
        target: proof,
        injected_after_writes: 30,
        all_counts_after_rollback: counts,
        matched_partial_rows_inserted: 2,
        baseline_reset_calls: 0,
      }),
    );
  } else {
    const beforeHashes = await db.user.findMany({
      select: { id: true, passwordHash: true },
      orderBy: { id: "asc" },
    });
    const rerun = await importVerified(
      db,
      archive,
      input,
      release.zip_sha256,
      hashes,
    );
    if (
      !rerun.noop ||
      rerun.writes !== 0 ||
      rerun.compared_existing_originals !== 2400
    )
      throw new Error("Exact complete rerun was not a byte-checked no-op.");
    const afterHashes = await db.user.findMany({
      select: { id: true, passwordHash: true },
      orderBy: { id: "asc" },
    });
    if (stableJson(beforeHashes) !== stableJson(afterHashes))
      throw new Error("Credential hashes rotated during rerun.");
    const counts = {
      teams: await db.team.count(),
      users: await db.user.count(),
      team_members: await db.teamMember.count(),
      clients: await db.client.count(),
      properties: await db.property.count(),
      deals: await db.deal.count(),
      documents: await db.document.count(),
    };
    const expected = {
      teams: 3,
      users: 10,
      team_members: 13,
      clients: 80,
      properties: 96,
      deals: 120,
      documents: 2400,
    };
    if (stableJson(counts) !== stableJson(expected))
      throw new Error("Main archive database counts differ.");
    const origin = "http://127.0.0.1:35533";
    const app = createApp(
      {
        NODE_ENV: "test",
        DATABASE_URL: target.databaseUrl,
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
      for (const [i, user] of archive.corpus.entities.users.entries()) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin },
          payload: { email: user.email, password: passwords[i]! },
        });
        const cookie = response.cookies.find(
          (c) => c.name === "agency_session",
        );
        if (response.statusCode !== 204 || !cookie)
          throw new Error(`Ephemeral login failed for account index ${i + 1}.`);
        cookies.push(`agency_session=${cookie.value}`);
      }
      const operationsIndex = archive.corpus.staff.findIndex(
        (s) => s.key === "operations-lead",
      );
      let downloads = 0;
      for (const row of archive.documents) {
        const current = await db.document.findUniqueOrThrow({
          where: { id: row.mapped.id },
        });
        if (stableJson(storedMetadata(current)) !== stableJson(row.mapped))
          throw new Error(`Stored metadata mismatch: ${row.key}`);
        assertStoredBytes(current.fileData, row);
        const response = await app.inject({
          method: "GET",
          url: `/api/documents/${row.mapped.id}/file`,
          headers: { cookie: cookies[operationsIndex]! },
        });
        if (
          response.statusCode !== 200 ||
          createHash("sha256").update(response.rawPayload).digest("hex") !==
            row.sha256
        )
          throw new Error(`Production download mismatch: ${row.key}`);
        downloads++;
      }
      const memberIndex = archive.corpus.staff.findIndex(
        (s) => s.key === "north-sales-agent-1",
      );
      const rental = archive.corpus.entities.deals.find(
        (d) => d.type === "rental",
      )!;
      const forbidden = await app.inject({
        method: "GET",
        url: `/api/deals/${rental.id}`,
        headers: { cookie: cookies[memberIndex]! },
      });
      if (forbidden.statusCode !== 404)
        throw new Error("Foreign-team deal was not hidden.");
      const receipt = {
        zip_sha256: release.zip_sha256,
        source_digest: archive.receipt.source_digest,
        target: proof,
        counts,
        exact_rerun: rerun,
        preserved_existing_password_hashes: true,
        ten_account_logins: cookies.length,
        all_original_database_bytes_checked: true,
        actual_production_route_downloads: downloads,
        foreign_team_status: forbidden.statusCode,
        transaction_fault_rollback: "task-17-rollback.json",
        upload_scratch_parity: "pending separate scratch suite",
        browser: "pending",
        baseline_integration_e2e: "pending separate target",
        process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
      };
      if (receipt.process_max_rss_bytes > limits.rss_bytes)
        throw new Error("Integration process peak RSS exceeded.");
      await writeFile(
        path.join(evidenceRoot, "task-17-import-verification.json"),
        stableJson(receipt),
      );
    } finally {
      await app.close();
    }
  }
} finally {
  await db.$disconnect();
}
