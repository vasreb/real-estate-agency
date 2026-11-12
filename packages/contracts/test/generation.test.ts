import { mkdtemp, readFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOpenApi,
  generateInto,
  checkGenerated,
} from "../scripts/generate.js";

describe("generated consumer contract", () => {
  it("describes all operations, multipart binary, nullable PATCH, 204 and download MIME", () => {
    const document = buildOpenApi();
    type Op = {
      operationId: string;
      requestBody?: { content: Record<string, { schema: Schema }> };
      responses: Record<string, { content?: Record<string, unknown> }>;
    };
    type Schema = {
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    const ops = Object.values(document.paths).flatMap(
      (item) => Object.values(item) as Op[],
    );
    expect(ops.map((op) => op.operationId).sort()).toEqual([
      "deleteDocument",
      "downloadDocument",
      "getDeal",
      "listDeals",
      "login",
      "logout",
      "patchDocument",
      "uploadDocument",
    ]);
    const byId = Object.fromEntries(ops.map((op) => [op.operationId, op]));
    const upload =
      byId.uploadDocument?.requestBody?.content["multipart/form-data"]?.schema;
    expect(upload?.properties.file).toMatchObject({
      type: "string",
      format: "binary",
      maxLength: 25_000_000,
    });
    expect(upload?.required).toEqual(
      expect.arrayContaining(["file", "title", "type"]),
    );
    const patch =
      byId.patchDocument?.requestBody?.content["application/json"]?.schema;
    for (const key of [
      "document_number",
      "document_date",
      "effective_from",
      "parent_document_id",
    ])
      expect(patch?.properties[key]?.anyOf).toContainEqual({ type: "null" });
    expect(patch?.properties.title).not.toHaveProperty("anyOf");
    expect(patch?.properties.status).not.toHaveProperty("anyOf");
    expect(patch?.required ?? []).toEqual([]);
    for (const id of ["login", "logout", "deleteDocument"])
      expect(byId[id]?.responses["204"]).toEqual({ description: "Success" });
    expect(
      Object.keys(byId.downloadDocument?.responses["200"]?.content ?? {}),
    ).toEqual([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    expect(byId.uploadDocument?.responses).toHaveProperty("201");
    expect(byId.deleteDocument?.responses).toHaveProperty("409");
    expect(JSON.stringify(document)).not.toContain("file_data");
  });
  it("generates deterministic bytes and rejects isolated drift without changing source", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "agency-contract-test-"));
    try {
      await generateInto(temp);
      const before = await readFile(path.join(temp, "openapi.json"));
      await generateInto(temp);
      expect(
        (await readFile(path.join(temp, "openapi.json"))).equals(before),
      ).toBe(true);
      await expect(checkGenerated(temp)).resolves.toBeUndefined();
      await appendFile(path.join(temp, "src/generated/paths.ts"), "// drift\n");
      await expect(checkGenerated(temp)).rejects.toThrow(
        "Generated contract drift",
      );
      expect(
        (
          await readFile(path.join(temp, "src/generated/paths.ts"), "utf8")
        ).endsWith("// drift\n"),
      ).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
