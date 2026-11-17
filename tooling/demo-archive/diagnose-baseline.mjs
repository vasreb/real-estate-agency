// Read-only comparison of baseline sources; generated comparison bytes stay in owned out/.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { generateInto } from "../../packages/contracts/scripts/generate.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const output = path.join(root, "out/agency-demo-archive/baseline-diagnostics");
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
await generateInto(output);
const results = [];
for (const name of ["openapi.json", "src/generated/paths.ts"]) {
  const actual = await readFile(
    path.join(root, "packages/contracts", name),
    "utf8",
  );
  const generated = await readFile(path.join(output, name), "utf8");
  results.push({
    file: `packages/contracts/${name}`,
    check: "generated-contract-byte-comparison",
    exact_equal: actual === generated,
    equal_after_crlf_to_lf: actual.replaceAll("\r\n", "\n") === generated,
    crlf_count: (actual.match(/\r\n/g) ?? []).length,
  });
}
for (const name of [
  "AGENTS.md",
  "apps/api/prisma/seed.ts",
  "apps/web/src/features/documents/delete-button.tsx",
]) {
  const filename = path.join(root, name);
  const actual = await readFile(filename, "utf8");
  const formatted = await format(actual, {
    ...(await resolveConfig(filename)),
    filepath: filename,
  });
  results.push({
    file: name,
    check: "prettier-memory-only",
    exact_equal: actual === formatted,
    equal_after_crlf_to_lf: actual.replaceAll("\r\n", "\n") === formatted,
    crlf_count: (actual.match(/\r\n/g) ?? []).length,
  });
}
await mkdir(evidence, { recursive: true });
await writeFile(
  path.join(evidence, "baseline-line-ending-diagnosis.json"),
  JSON.stringify(
    {
      baseline_files_modified: false,
      comparison_output: "out/agency-demo-archive/baseline-diagnostics",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(results, null, 2));
