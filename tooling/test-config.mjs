import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    new URL("../packages/config/tsconfig.json", import.meta.url),
    "utf8",
  ),
);
for (const key of [
  "strict",
  "noUncheckedIndexedAccess",
  "forceConsistentCasingInFileNames",
  "skipLibCheck",
]) {
  assert.equal(config.compilerOptions[key], true, key);
}
assert.equal(config.compilerOptions.target, "ES2022");
console.log(
  "Shared TypeScript configuration: valid JSON with required strict options.",
);
