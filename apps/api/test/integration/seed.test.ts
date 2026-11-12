import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import yauzl from "yauzl";
import { createDatabase } from "../../src/infrastructure/database/index.js";
import { verifyPassword } from "../../src/modules/auth/index.js";
import { runSeed } from "../../prisma/seed.js";
import {
  createSampleDocx,
  createSamplePdf,
  DOCX_MIME,
  ids,
  PDF_MIME,
  testPasswords,
} from "../fixtures/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("/agency_test"))
  throw new Error(
    "Integration tests require the isolated agency_test database.",
  );

const db = createDatabase(databaseUrl);
afterAll(async () => {
  await db.$disconnect();
});

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function counts() {
  const [users, teams, members, clients, properties, deals, documents] =
    await Promise.all([
      db.user.count(),
      db.team.count(),
      db.teamMember.count(),
      db.client.count(),
      db.property.count(),
      db.deal.count(),
      db.document.count(),
    ]);
  return { users, teams, members, clients, properties, deals, documents };
}

function zipEntries(bytes: Uint8Array): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true },
      (error, zip) => {
        if (error) return reject(error);
        const names: string[] = [];
        zip.on("entry", (entry: yauzl.Entry) => {
          names.push(entry.fileName);
          zip.readEntry();
        });
        zip.on("end", () => resolve(names));
        zip.on("error", reject);
        zip.readEntry();
      },
    );
  });
}

function runSeedProcess(env: Record<string, string | undefined>) {
  const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
      ),
      "prisma/seed.ts",
    ],
    {
      cwd: apiRoot,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        ...env,
      },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

describe("test seed", () => {
  it("is idempotent when run twice", async () => {
    const before = await counts();
    expect(before).toEqual({
      users: 4,
      teams: 2,
      members: 5,
      clients: 2,
      properties: 2,
      deals: 3,
      documents: 3,
    });
    await runSeed(db, "test", testPasswords);
    await runSeed(db, "test", testPasswords);
    expect(await counts()).toEqual(before);
  });

  it("creates the acceptance memberships with normalized emails and Argon2id hashes", async () => {
    const users = await db.user.findMany({
      select: {
        email: true,
        passwordHash: true,
        memberships: { select: { teamId: true, role: true } },
      },
      orderBy: { email: "asc" },
    });
    const memberships = Object.fromEntries(
      users.map((user) => [
        user.email,
        user.memberships
          .map(
            (m) =>
              `${m.teamId === ids.teamNorth ? "north" : "south"}:${m.role}`,
          )
          .sort(),
      ]),
    );
    expect(memberships).toEqual({
      "admin@agency.test": ["north:admin"],
      "member@agency.test": ["north:member"],
      "multi@agency.test": ["north:member", "south:admin"],
      "other@agency.test": ["south:member"],
    });
    for (const user of users) {
      expect(user.email).toBe(user.email.trim().toLowerCase());
      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(Object.values(testPasswords)).not.toContain(user.passwordHash);
    }
    const admin = users.find((user) => user.email === "admin@agency.test");
    await expect(
      verifyPassword(admin!.passwordHash, testPasswords.admin),
    ).resolves.toBe(true);
  });

  it("models two teams, a client and property with several deals, and a repeated deal number", async () => {
    const deals = await db.deal.findMany({
      select: { number: true, teamId: true, clientId: true, propertyId: true },
    });
    expect(deals.filter((d) => d.clientId === ids.clientCompany)).toHaveLength(
      2,
    );
    expect(
      deals.filter((d) => d.propertyId === ids.propertyCentral),
    ).toHaveLength(2);
    expect(
      new Set(deals.filter((d) => d.number === "2026-001").map((d) => d.teamId))
        .size,
    ).toBe(2);
  });

  it("stores real PDF and DOCX originals with deterministic hashes and a linked amendment", async () => {
    const documents = await db.document.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        type: true,
        parentDocumentId: true,
        mimeType: true,
        fileData: true,
      },
    });
    const [north, amendment, south] = documents;
    expect(north).toMatchObject({ type: "contract", mimeType: PDF_MIME });
    expect(amendment).toMatchObject({
      type: "amendment",
      mimeType: DOCX_MIME,
      parentDocumentId: ids.docNorthContract,
    });
    expect(south).toMatchObject({ type: "contract", mimeType: PDF_MIME });
    expect(sha256(north!.fileData)).toBe(
      sha256(await createSamplePdf("Sale contract 2026-001 (North team)")),
    );
    expect(sha256(amendment!.fileData)).toBe(
      sha256(createSampleDocx("Дополнительное соглашение № 1")),
    );
    const pdf = await PDFDocument.load(north!.fileData);
    expect(pdf.getPageCount()).toBe(1);
    expect(Buffer.from(north!.fileData.subarray(0, 5)).toString()).toBe(
      "%PDF-",
    );
    expect(await zipEntries(amendment!.fileData)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
    ]);
  });
});

describe("seed guards", () => {
  it.each([
    { NODE_ENV: "production", APP_ENV: "test" },
    { NODE_ENV: "development", APP_ENV: "production" },
  ])("refuses production configuration %o before any write", async (flags) => {
    const before = await counts();
    const result = runSeedProcess({ DATABASE_URL: databaseUrl, ...flags });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Seed is forbidden in production.");
    expect(result.stdout).not.toContain("Seed completed");
    expect(await counts()).toEqual(before);
  });

  it("refuses a development seed without configured passwords", () => {
    const result = runSeedProcess({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "development",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SEED_ADMIN_PASSWORD must contain");
  });

  it("refuses test mode against a non-test database name", () => {
    const result = runSeedProcess({
      DATABASE_URL: Object.assign(new URL(databaseUrl), { pathname: "/agency" })
        .href,
      APP_ENV: "test",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("only targets the local agency_test");
  });
});
