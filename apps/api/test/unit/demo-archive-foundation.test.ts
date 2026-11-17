import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { runCli } from "../../prisma/demo-archive/cli.js";
import {
  documentRecordSchema,
  entitiesSchema,
  projectDocumentMetadata,
  stableId,
} from "../../prisma/demo-archive/model.js";
import {
  assertGeneratorImport,
  ownedOutputPath,
  workspaceRoot,
} from "../../prisma/demo-archive/policy.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

const metadata = {
  id: stableId("document/one"),
  deal_id: stableId("deal/one"),
  parent_document_id: null,
  type: "other" as const,
  title: "Instruction receipt",
  document_number: "DEMO-RECEIPT-001",
  document_date: "2025-01-03",
  effective_from: null,
  status: "unknown" as const,
  file_name: "receipt.pdf",
  mime_type: "application/pdf" as const,
  created_at: "2025-01-04T12:00:00.000Z",
};
const document = {
  mapped: metadata,
  key: "document/one",
  family: "C07",
  instrument_key: "receipt/one",
  event_key: "delivery/one",
  purpose: "Record receipt of the instruction pack by the principal.",
  author_role: "agency administrator",
  recipient_actor_keys: ["principal/one"],
  path: "documents/north-sales/matter-one/receipt.pdf",
  byte_length: 1024,
  sha256: "a".repeat(64),
  unresolved_parent_reason: null,
  revises_instrument_key: null,
  provenance: { classification: "original-synthetic", source_keys: [] },
};

function effects() {
  const writes: unknown[] = [];
  const messages: string[] = [];
  return {
    writes,
    messages,
    dispatch: (value: unknown) => {
      writes.push(value);
      return Promise.resolve();
    },
    print: (text: string) => {
      messages.push(text);
    },
  };
}

describe("demo archive foundation", () => {
  it("refuses provisioning and QA wrappers under a production flag before Docker/database work", () => {
    for (const file of [
      "integration.mjs",
      "scratch.mjs",
      "browser.mjs",
      "baseline.mjs",
    ]) {
      const result = spawnSync(
        process.execPath,
        [path.join(workspaceRoot, "tooling/demo-archive", file)],
        {
          cwd: workspaceRoot,
          env: { APP_ENV: "production" },
          encoding: "utf8",
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("forbidden in production");
    }
  });
  it("accepts only owned explicit validation evidence paths", async () => {
    const { dispatch, print, writes } = effects();
    await runCli(
      [
        "validate",
        "--input",
        "out/agency-demo-archive/v1",
        "--evidence",
        ".omo/evidence/realistic-agency-archive/task-13-final.json",
      ],
      { env: {}, print, dispatch },
    );
    expect(writes).toHaveLength(1);
    await expect(
      runCli(
        [
          "validate",
          "--input",
          "out/agency-demo-archive/v1",
          "--evidence",
          "out/unowned.json",
        ],
        { env: {}, print, dispatch },
      ),
    ).rejects.toThrow();
  });
  it("help and inspect are offline, rooted independently of cwd and never dispatch writes", async () => {
    const { dispatch, writes } = effects();
    const messages: string[] = [];
    const runtime = {
      env: {},
      print: (s: string) => messages.push(s),
      dispatch,
    };
    await runCli(["--help"], runtime);
    await runCli(["inspect"], runtime);
    expect(writes).toHaveLength(0);
    expect(messages.join("\n")).toContain("not for execution");
    expect(path.isAbsolute(workspaceRoot)).toBe(true);
    expect(ownedOutputPath("out/agency-demo-archive/plan.json")).toBe(
      path.join(workspaceRoot, "out/agency-demo-archive/plan.json"),
    );
    recordScenario(1, "happy", {
      offline_dispatch_calls: writes.length,
    });
  });

  it("validates public metadata and makes explicit existing-field projections", () => {
    expect(documentRecordSchema.parse(document)).toEqual(document);
    expect(projectDocumentMetadata(document)).toEqual(metadata);
    expect(stableId("deal/one")).toBe(stableId("deal/one"));
    expect(stableId("deal/one")).not.toBe(stableId("property/one"));
    expect(stableId("deal/one")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("rejects production flags, unknown commands and escaping output before dispatch", async () => {
    const { dispatch, print, writes } = effects();
    for (const args of [
      ["reset"],
      ["build", "--production"],
      ["build"],
      ["build", "--output", "../real-estate-agency/out"],
      ["build", "--output", "out/../apps"],
      ["build", "--output", "out/agency-demo-archive/x:stream"],
      ["build", "--output", "out/agency-demo-archive/CON"],
      ["build", "--output", "out/agency-demo-archive/alias. "],
      ["build", "--output", "out/agency-demo-archive/x", "--output", "out/y"],
      ["import", "--dry-run"],
    ]) {
      await expect(
        runCli(args, { env: {}, print, dispatch }),
      ).rejects.toThrow();
    }
    for (const env of [{ NODE_ENV: "production" }, { APP_ENV: "production" }]) {
      await expect(
        runCli(["--help"], { env, print, dispatch }),
      ).rejects.toThrow("production");
    }
    expect(writes).toHaveLength(0);
    recordScenario(1, "failure", {
      rejected_cli_cases: 12,
      write_dispatch_calls: 0,
    });
  });

  it("dry-run is explicit and cannot reach a writing handler", async () => {
    const { dispatch, print, writes, messages } = effects();
    await runCli(
      ["build", "--dry-run", "--output", "out/agency-demo-archive/v1"],
      {
        env: {},
        print,
        dispatch,
      },
    );
    expect(writes).toHaveLength(0);
    expect(messages.join("\n")).toContain("not validated");
  });

  it.each(["file_data", "password_hash", "sessions", "bedrooms"])(
    "rejects prohibited public field %s at every strict level",
    (key) => {
      expect(
        documentRecordSchema.safeParse({ ...document, [key]: "forbidden" })
          .success,
      ).toBe(false);
      expect(
        documentRecordSchema.safeParse({
          ...document,
          mapped: { ...metadata, [key]: "forbidden" },
        }).success,
      ).toBe(false);
      expect(
        entitiesSchema.safeParse({
          teams: [],
          users: [
            {
              id: stableId("user/a"),
              email: "a@northbridge-vale.example",
              [key]: "forbidden",
            },
          ],
          team_members: [],
          clients: [],
          properties: [],
          deals: [],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects rich property columns, invalid family and unsafe file paths", () => {
    expect(
      entitiesSchema.safeParse({
        teams: [],
        users: [],
        team_members: [],
        clients: [],
        properties: [
          {
            id: stableId("property/a"),
            address: "Synthetic London N8",
            bedrooms: 2,
          },
        ],
        deals: [],
      }).success,
    ).toBe(false);
    expect(
      documentRecordSchema.safeParse({ ...document, family: "S17" }).success,
    ).toBe(false);
    expect(
      documentRecordSchema.safeParse({ ...document, path: "../escape.pdf" })
        .success,
    ).toBe(false);
  });

  it("enforces boundaries on actual source imports as well as adversarial specifiers", () => {
    const root = path.join(workspaceRoot, "apps/api/prisma/demo-archive");
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const syntax = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          assertGeneratorImport(file, node.moduleSpecifier.text);
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteral(argument))
            throw new Error("Computed generator import refused.");
          assertGeneratorImport(file, argument.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(syntax);
    }
    const importer = path.join(root, "persistence/import.ts");
    for (const specifier of [
      "../../../src/modules/documents/infrastructure/files/index.js",
      "../../../src/modules/auth/application/passwords.js",
      "dotenv/config",
      "../../seed.js",
      "../../../src/server.js",
      "@agency/contracts/src/schemas.ts",
    ])
      expect(() => assertGeneratorImport(importer, specifier)).toThrow();
    expect(() =>
      assertGeneratorImport(importer, "../../../src/modules/auth/index.js"),
    ).not.toThrow();
  });
});
