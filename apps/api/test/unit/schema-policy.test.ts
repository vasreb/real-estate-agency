import { readFileSync } from "node:fs";

const schema = readFileSync(
  new URL("../../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../prisma/migrations/202611120001_initial/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
function assertPolicy(prisma: string, sql: string) {
  if (
    !prisma.includes("@db.Date") ||
    !prisma.includes("@db.Timestamptz(3)") ||
    !prisma.includes("fileData") ||
    !prisma.includes("Bytes")
  )
    throw new Error("Storage type policy");
  for (const name of [
    "documents_parent_same_deal_fk",
    "documents_not_self_parent",
    "documents_only_amendment_parent",
    "documents_deal_id_id_key",
    "team_members_user_id_idx",
    "documents_deal_id_parent_document_id_idx",
  ]) {
    if (!sql.includes(name))
      throw new Error(`Missing constraint/index: ${name}`);
  }
  if (
    !/REFERENCES "documents"\("deal_id", "id"\)\s+ON DELETE RESTRICT/.test(sql)
  )
    throw new Error("Parent deletion must restrict");
  if (
    !/"token_hash" CHAR\(64\) NOT NULL/.test(sql) ||
    !/PRIMARY KEY \("token_hash"\)/.test(sql)
  )
    throw new Error("Session hash primary key");
}
describe("schema/migration policy (DB assertions live in integration tests)", () => {
  it("includes required physical types, constraints and indexes", () => {
    expect(() => assertPolicy(schema, migration)).not.toThrow();
  });
  it("rejects isolated malformed schema/migration fixtures", () => {
    expect(() =>
      assertPolicy(schema.replaceAll("@db.Date", ""), migration),
    ).toThrow("Storage type");
    expect(() =>
      assertPolicy(
        schema,
        migration.replaceAll("documents_not_self_parent", "missing"),
      ),
    ).toThrow("Missing constraint");
    expect(() =>
      assertPolicy(
        schema,
        migration.replace(
          "ON DELETE RESTRICT ON UPDATE RESTRICT",
          "ON DELETE CASCADE ON UPDATE RESTRICT",
        ),
      ),
    ).toThrow("Parent deletion");
    expect(() =>
      assertPolicy(
        schema,
        migration.replace(
          'PRIMARY KEY ("token_hash")',
          'PRIMARY KEY ("user_id")',
        ),
      ),
    ).toThrow("Session hash");
  });
});

const ragMigration = readFileSync(
  new URL(
    "../../prisma/migrations/202611170001_rag_foundation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
describe("RAG foundation migration policy", () => {
  it("declares the extension, owner checks, chunk cascade and job uniqueness", () => {
    for (const name of [
      "CREATE EXTENSION IF NOT EXISTS vector",
      "documents_single_owner",
      "documents_team_collection_shape",
      "vector(1024)",
      "index_jobs_one_active_per_document",
    ])
      expect(ragMigration).toContain(name);
    expect(ragMigration).toMatch(
      /document_chunks_document_id_fkey[^;]*ON DELETE CASCADE/,
    );
    expect(ragMigration).not.toMatch(/CREATE INDEX[^;]*hnsw/i);
  });
});
