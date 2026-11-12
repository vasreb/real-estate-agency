import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import openapiTS, { astToString } from "openapi-typescript";
import { format } from "prettier";
import {
  apiErrorSchema,
  MAX_FILE_BYTES,
  SESSION_COOKIE,
} from "../src/index.js";
import { operations } from "../src/operations.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output") {
  const converted = z.toJSONSchema(schema, { io });
  delete converted.$schema;
  return converted;
}
export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const responses: Record<string, unknown> = {};
    responses[String(operation.status)] = {
      description: "Success",
      ...(operation.response
        ? {
            content: {
              "application/json": { schema: jsonSchema(operation.response) },
            },
          }
        : {}),
      ...(operation.binary
        ? {
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                { schema: { type: "string", format: "binary" } },
            },
            headers: {
              "Content-Disposition": {
                schema: { type: "string" },
                description: "attachment with filename and UTF-8 filename*",
              },
            },
          }
        : {}),
    };
    for (const status of [...operation.errors, 500]) {
      responses[String(status)] = {
        description: "Error",
        content: { "application/json": { schema: jsonSchema(apiErrorSchema) } },
      };
    }
    const parameters = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      }),
    );
    let requestBody;
    if (operation.body && operation.requestMedia) {
      const schema = jsonSchema(operation.body, "input");
      if (operation.requestMedia === "multipart/form-data") {
        schema.properties = {
          ...schema.properties,
          file: { type: "string", format: "binary", maxLength: MAX_FILE_BYTES },
        };
        schema.required = [...(schema.required ?? []), "file"];
      }
      requestBody = {
        required: true,
        content: { [operation.requestMedia]: { schema } },
      };
    }
    (paths[operation.path] ??= {})[operation.method] = {
      operationId: operation.operationId,
      ...(["post", "patch", "delete"].includes(operation.method)
        ? {
            description:
              "Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403.",
          }
        : {}),
      security: operation.authenticated ? [{ session: [] }] : [],
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    "x-generated":
      "Generated from src/schemas.ts and src/operations.ts. Do not edit.",
    info: { title: "Agency API", version: "1.0.0" },
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: SESSION_COOKIE },
      },
    },
    paths,
  };
}
export async function generateInto(outputRoot: string) {
  const document = await format(JSON.stringify(buildOpenApi()), {
    parser: "json",
  });
  const ast = await openapiTS(document, { alphabetize: true });
  const types = await format(
    `// Generated from canonical Zod schemas and operation descriptors. Do not edit.\n${astToString(ast)}`,
    { parser: "typescript" },
  );
  await mkdir(path.join(outputRoot, "src/generated"), { recursive: true });
  await writeFile(path.join(outputRoot, "openapi.json"), document);
  await writeFile(path.join(outputRoot, "src/generated/paths.ts"), types);
}
export async function checkGenerated(targetRoot = packageRoot) {
  const temporary = await mkdtemp(path.join(tmpdir(), "agency-contracts-"));
  try {
    await generateInto(temporary);
    for (const relative of ["openapi.json", "src/generated/paths.ts"]) {
      const [expected, actual] = await Promise.all([
        readFile(path.join(temporary, relative)),
        readFile(path.join(targetRoot, relative)),
      ]);
      if (!expected.equals(actual))
        throw new Error(
          `Generated contract drift: ${relative}. Run pnpm contracts:generate.`,
        );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--check")) {
    await checkGenerated();
    console.log("Generated API contracts: no drift.");
  } else {
    await generateInto(packageRoot);
    console.log("Generated OpenAPI 3.1 and TypeScript consumers.");
  }
}
