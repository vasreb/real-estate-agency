import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDatabase,
  type Database,
} from "../../../src/infrastructure/database/index.js";
import { preflightArchive } from "./preflight.js";
import { resolveImportTarget, verifyOwnedTarget } from "./target.js";
import { readPasswords, hashPasswords } from "./credentials.js";
import {
  compareRows,
  compareUserIdentities,
  storedMetadata,
  documentData,
  assertStoredBytes,
} from "./compare.js";
import { stableJson } from "../model.js";
import { evidenceRoot, limits } from "../policy.js";
import { scanArchive } from "../archive/read.js";

export type VerifiedArchive = Awaited<ReturnType<typeof preflightArchive>>;
/** All public comparisons, original reads and writes below share one transaction.
 * Fault injection is QA-only and cannot commit a partial result. */
export async function importVerified(
  db: Database,
  archive: VerifiedArchive,
  input: string,
  digest: string,
  hashes: readonly string[],
  faultAfterWrites?: number,
) {
  if (hashes.length !== 10)
    throw new Error("Ten precomputed credential hashes required.");
  const started = performance.now();
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '300000ms'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10000ms'");
      await tx.$queryRawUnsafe(
        "SELECT 1 AS locked FROM pg_advisory_xact_lock(1952785, 1)",
      );
      const e = archive.corpus.entities;
      const inserted = {
        teams: 0,
        users: 0,
        team_members: 0,
        clients: 0,
        properties: 0,
        deals: 0,
        documents: 0,
      };
      let writes = 0;
      const tick = () => {
        writes++;
        if (faultAfterWrites !== undefined && writes >= faultAfterWrites)
          throw new Error("Injected archive import rollback fixture.");
      };
      const teams = compareRows(
        e.teams,
        await tx.team.findMany({
          where: { id: { in: e.teams.map((r) => r.id) } },
        }),
        (r) => r.id,
        "teams",
      );
      const users = compareUserIdentities(
        e.users,
        await tx.user.findMany({
          where: {
            OR: [
              { id: { in: e.users.map((r) => r.id) } },
              { email: { in: e.users.map((r) => r.email) } },
            ],
          },
        }),
      );
      const memberRows = e.team_members.map((r) => ({
        teamId: r.team_id,
        userId: r.user_id,
        role: r.role,
      }));
      const memberships = compareRows(
        memberRows,
        await tx.teamMember.findMany({
          where: {
            OR: [
              { teamId: { in: e.teams.map((r) => r.id) } },
              { userId: { in: e.users.map((r) => r.id) } },
            ],
          },
        }),
        (r) => `${r.teamId}/${r.userId}`,
        "memberships",
      );
      const clients = compareRows(
        e.clients,
        await tx.client.findMany({
          where: { id: { in: e.clients.map((r) => r.id) } },
        }),
        (r) => r.id,
        "clients",
      );
      const properties = compareRows(
        e.properties,
        await tx.property.findMany({
          where: { id: { in: e.properties.map((r) => r.id) } },
        }),
        (r) => r.id,
        "properties",
      );
      const dealRows = e.deals.map((r) => ({
        id: r.id,
        number: r.number,
        type: r.type,
        clientId: r.client_id,
        propertyId: r.property_id,
        teamId: r.team_id,
      }));
      const deals = compareRows(
        dealRows,
        await tx.deal.findMany({
          where: {
            OR: [
              { id: { in: e.deals.map((r) => r.id) } },
              { teamId: { in: e.teams.map((r) => r.id) } },
            ],
          },
        }),
        (r) => r.id,
        "deals/team-local numbers",
      );
      const stored = await tx.document.findMany({
        where: {
          OR: [
            { id: { in: archive.documents.map((r) => r.mapped.id) } },
            { dealId: { in: e.deals.map((r) => r.id) } },
          ],
        },
        select: {
          id: true,
          dealId: true,
          parentDocumentId: true,
          type: true,
          title: true,
          documentNumber: true,
          documentDate: true,
          effectiveFrom: true,
          status: true,
          fileName: true,
          mimeType: true,
          createdAt: true,
        },
      });
      const missingDocuments = compareRows(
        archive.documents.map((r) => r.mapped),
        stored.map(storedMetadata),
        (r) => r.id,
        "document metadata/extra corpus-deal documents",
      );
      const missingIds = new Set(missingDocuments.map((r) => r.id));
      // Each conflict above aborts before writes. All byte conflicts later still
      // roll back this same transaction; no account or role is updated/deleted.
      for (const row of teams) {
        await tx.team.create({ data: row });
        inserted.teams++;
        tick();
      }
      for (const row of users) {
        await tx.user.create({
          data: {
            ...row,
            passwordHash: hashes[e.users.findIndex((u) => u.id === row.id)]!,
          },
        });
        inserted.users++;
        tick();
      }
      for (const row of memberships) {
        await tx.teamMember.create({ data: row });
        inserted.team_members++;
        tick();
      }
      for (const row of clients) {
        await tx.client.create({ data: row });
        inserted.clients++;
        tick();
      }
      for (const row of properties) {
        await tx.property.create({ data: row });
        inserted.properties++;
        tick();
      }
      for (const row of deals) {
        await tx.deal.create({ data: row });
        inserted.deals++;
        tick();
      }
      const byPath = new Map(archive.documents.map((r) => [r.path, r]));
      let comparedBytes = 0;
      // Two sequential passes keep every parent contract ahead of its amendments
      // without retaining hundreds of MiB of original bytes in JS memory.
      for (const amendments of [false, true])
        await scanArchive(input, digest, async (name, bytes) => {
          const row = byPath.get(name);
          if (!row || (row.mapped.type === "amendment") !== amendments) return;
          assertStoredBytes(bytes, row);
          if (missingIds.has(row.mapped.id)) {
            await tx.document.create({
              data: documentData(row, bytes),
              select: { id: true },
            });
            inserted.documents++;
            tick();
          } else {
            const old = await tx.document.findUniqueOrThrow({
              where: { id: row.mapped.id },
              select: { fileData: true },
            });
            assertStoredBytes(old.fileData, row);
            comparedBytes++;
          }
          if (process.memoryUsage().rss > limits.rss_bytes)
            throw new Error("Import RSS budget exceeded.");
        });
      if (process.resourceUsage().maxRSS * 1024 > limits.rss_bytes)
        throw new Error(
          "Measured import peak RSS exceeds policy before commit.",
        );
      return {
        inserted,
        compared_existing_originals: comparedBytes,
        noop: writes === 0,
        writes,
        transaction_elapsed_ms: Math.round(performance.now() - started),
        advisory_lock: "corpus-specific transaction lock",
        transaction_timeout_ms: limits.transaction_ms,
        lock_wait_ms: limits.lock_wait_ms,
      };
    },
    { timeout: limits.transaction_ms, maxWait: limits.lock_wait_ms },
  );
}
export async function importArchive(
  input: string,
  digest: string,
  confirmation: string,
  env: NodeJS.ProcessEnv,
) {
  const target = resolveImportTarget(env, confirmation);
  const passwords = readPasswords(env); // never connect with missing/short inputs
  const archive = await preflightArchive(input, digest);
  const proof = verifyOwnedTarget(
    target,
    archive.receipt.source_digest,
    archive.receipt.original_bytes,
  );
  const hashes = await hashPasswords(passwords); // outside the write transaction
  const db = createDatabase(target.databaseUrl);
  try {
    const identity = await db.$queryRawUnsafe<
      { database: string; role: string; version: string }[]
    >(
      "SELECT current_database() AS database, current_user AS role, current_setting('server_version_num') AS version",
    );
    if (
      identity[0]?.database !== "agency_demo_archive" ||
      identity[0].role !== "agency_archive" ||
      Number(identity[0].version) < 180000 ||
      Number(identity[0].version) >= 190000
    )
      throw new Error("Connected database identity mismatch.");
    const result = await importVerified(db, archive, input, digest, hashes);
    const receipt = {
      zip_sha256: digest,
      source_digest: archive.receipt.source_digest,
      target: proof,
      ...result,
      process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
      credentials:
        "Process-only inputs; existing hashes and all sessions preserved; no credentials in receipt",
    };
    if (receipt.process_max_rss_bytes > limits.rss_bytes)
      throw new Error("Measured import peak RSS exceeds policy.");
    await writeFile(
      path.join(evidenceRoot, "task-16-import.json"),
      stableJson(receipt),
    );
    return receipt;
  } finally {
    await db.$disconnect();
  }
}
