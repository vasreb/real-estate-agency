import type { Prisma } from "../src/generated/prisma/client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDatabase,
  type Database,
} from "../src/infrastructure/database/index.js";
import { hashPassword, normalizeEmail } from "../src/modules/auth/index.js";
import {
  createSampleDocx,
  createSamplePdf,
  DOCX_MIME,
  PDF_MIME,
} from "./sample-documents.js";
import {
  baseAccounts,
  clients,
  deals,
  ids,
  multiTeamAccount,
  properties,
  teams,
  type SeedAccount,
} from "./seed-data.js";

export type SeedMode = "development" | "test";
export type SeedPasswords = Partial<Record<SeedAccount["passwordKey"], string>>;

const MIN_PASSWORD_LENGTH = 12;

/**
 * Validates the environment before any database connection is opened.
 * Production is always refused; test mode only targets agency_test locally.
 */
export function resolveSeedTarget(env: NodeJS.ProcessEnv): {
  mode: SeedMode;
  databaseUrl: string;
} {
  if (env.NODE_ENV === "production" || env.APP_ENV === "production")
    throw new Error("Seed is forbidden in production.");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !URL.canParse(databaseUrl))
    throw new Error("DATABASE_URL is required for seeding.");
  const mode: SeedMode = env.APP_ENV === "test" ? "test" : "development";
  if (mode === "test") {
    const url = new URL(databaseUrl);
    if (
      url.pathname !== "/agency_test" ||
      !["127.0.0.1", "localhost", "[::1]", "postgres-test"].includes(
        url.hostname,
      )
    )
      throw new Error("Test seed only targets the local agency_test database.");
  }
  return { mode, databaseUrl };
}

export function developmentPasswords(env: NodeJS.ProcessEnv): SeedPasswords {
  const passwords = {
    admin: env.SEED_ADMIN_PASSWORD,
    member: env.SEED_MEMBER_PASSWORD,
    other: env.SEED_OTHER_PASSWORD,
  };
  for (const [key, value] of Object.entries(passwords))
    if (!value || value.length < MIN_PASSWORD_LENGTH)
      throw new Error(
        `SEED_${key.toUpperCase()}_PASSWORD must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
  return passwords;
}

/** Idempotent: rows are upserted by fixed id; existing rows are not modified. */
export async function runSeed(
  db: Database,
  mode: SeedMode,
  passwords: SeedPasswords,
): Promise<void> {
  const accounts =
    mode === "test" ? [...baseAccounts, multiTeamAccount] : baseAccounts;
  const hashed = await Promise.all(
    accounts.map(async (account) => {
      const password = passwords[account.passwordKey];
      if (!password)
        throw new Error(`Missing ${account.passwordKey} password.`);
      return { account, passwordHash: await hashPassword(password) };
    }),
  );
  const [contractPdf, amendmentDocx, southPdf] = await Promise.all([
    createSamplePdf("Sale contract 2026-001 (North team)"),
    Promise.resolve(createSampleDocx("Дополнительное соглашение № 1")),
    createSamplePdf("Sale contract 2026-001 (South team)"),
  ]);
  await db.$transaction(
    async (tx) => {
      for (const team of teams)
        await tx.team.upsert({
          where: { id: team.id },
          create: team,
          update: {},
        });
      for (const { account, passwordHash } of hashed) {
        const email = normalizeEmail(account.email);
        await tx.user.upsert({
          where: { id: account.id },
          create: { id: account.id, email, passwordHash },
          update: {},
        });
        for (const membership of account.memberships)
          await tx.teamMember.upsert({
            where: {
              teamId_userId: { teamId: membership.teamId, userId: account.id },
            },
            create: { ...membership, userId: account.id },
            update: {},
          });
      }
      for (const client of clients)
        await tx.client.upsert({
          where: { id: client.id },
          create: client,
          update: {},
        });
      for (const property of properties)
        await tx.property.upsert({
          where: { id: property.id },
          create: property,
          update: {},
        });
      for (const deal of deals)
        await tx.deal.upsert({
          where: { id: deal.id },
          create: deal,
          update: {},
        });
      const documents: Prisma.DocumentUncheckedCreateInput[] = [
        {
          id: ids.docNorthContract,
          dealId: ids.dealNorthSale,
          type: "contract" as const,
          title: "Договор купли-продажи",
          documentNumber: "ДКП-2026-001",
          documentDate: new Date("2026-01-15T00:00:00Z"),
          status: "signed" as const,
          fileName: "Договор купли-продажи.pdf",
          mimeType: PDF_MIME,
          fileData: contractPdf,
        },
        {
          id: ids.docNorthAmendment,
          dealId: ids.dealNorthSale,
          parentDocumentId: ids.docNorthContract,
          type: "amendment" as const,
          title: "Дополнительное соглашение № 1",
          documentNumber: "ДС-1",
          documentDate: new Date("2026-02-20T00:00:00Z"),
          effectiveFrom: new Date("2026-03-01T00:00:00Z"),
          status: "draft" as const,
          fileName: "Допсоглашение 1.docx",
          mimeType: DOCX_MIME,
          fileData: amendmentDocx,
        },
        {
          id: ids.docSouthContract,
          dealId: ids.dealSouthSale,
          type: "contract" as const,
          title: "Договор купли-продажи",
          status: "unknown" as const,
          fileName: "contract-south.pdf",
          mimeType: PDF_MIME,
          fileData: southPdf,
        },
      ];
      for (const document of documents)
        await tx.document.upsert({
          where: { id: document.id },
          create: document,
          update: {},
          select: { id: true },
        });
    },
    { timeout: 30_000 },
  );
}

async function main() {
  const target = resolveSeedTarget(process.env);
  const passwords =
    target.mode === "test"
      ? (await import("../test/fixtures/index.js")).testPasswords
      : developmentPasswords(process.env);
  const db = createDatabase(target.databaseUrl);
  try {
    await runSeed(db, target.mode, passwords);
    console.log(`Seed completed (${target.mode}).`);
  } finally {
    await db.$disconnect();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Seed failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}
