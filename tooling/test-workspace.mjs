import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const packagePaths = [
  "apps/api",
  "apps/web",
  "packages/config",
  "packages/contracts",
  "packages/ui",
];
export function validateWorkspace(root = process.cwd()) {
  const read = (p) =>
    JSON.parse(readFileSync(path.join(root, p, "package.json"), "utf8"));
  assert.equal(read(".").packageManager, "pnpm@10.28.2");
  const names = new Set();
  for (const p of packagePaths) {
    assert.ok(
      existsSync(path.join(root, p, "package.json")),
      `Required package missing: ${p}`,
    );
    const manifest = read(p);
    assert.equal(manifest.name, `@agency/${path.basename(p)}`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, "module");
    assert.equal(manifest.engines.node, ">=24 <25");
    assert.ok(!names.has(manifest.name));
    names.add(manifest.name);
    for (const script of [
      "build",
      "typecheck",
      ...(p === "apps/api"
        ? ["test:unit", "test:integration"]
        : p === "packages/config"
          ? []
          : ["test"]),
    ]) {
      assert.ok(
        manifest.scripts[script],
        `${manifest.name}: missing ${script}`,
      );
      assert.doesNotMatch(
        manifest.scripts[script],
        /if-present|passWithNoTests|echo\s|exit 0/,
      );
    }
    if (p.startsWith("packages/"))
      assert.ok(manifest.exports, `${p}: missing exports`);
  }
  return names;
}
function selfTest() {
  const temp = mkdtempSync(path.join(tmpdir(), "agency-workspace-"));
  try {
    for (const p of [".", ...packagePaths]) {
      mkdirSync(path.join(temp, p), { recursive: true });
      writeFileSync(
        path.join(temp, p, "package.json"),
        readFileSync(path.join(p, "package.json")),
      );
    }
    validateWorkspace(temp);
    rmSync(path.join(temp, "apps/api/package.json"));
    assert.throws(() => validateWorkspace(temp), /Required package missing/);
    console.log("Missing required API package: rejected.");
    const jest = path.resolve("apps/api/node_modules/jest/bin/jest.js");
    const config = JSON.stringify({
      rootDir: temp,
      testMatch: ["<rootDir>/**/*.test.cjs"],
    });
    const empty = spawnSync(
      process.execPath,
      [jest, "--config", config, "--runInBand"],
      { encoding: "utf8" },
    );
    assert.notEqual(empty.status, 0, "Empty test discovery must fail");
    assert.match(empty.stdout + empty.stderr, /No tests found/);
    console.log("Empty required test suite: rejected by actual Jest runner.");
    writeFileSync(
      path.join(temp, "failure.test.cjs"),
      "test('negative control', () => expect(1).toBe(2));\n",
    );
    const failed = spawnSync(
      process.execPath,
      [jest, "--config", config, "--runInBand"],
      { encoding: "utf8" },
    );
    assert.notEqual(failed.status, 0, "Failing test must fail");
    assert.match(failed.stdout + failed.stderr, /1 failed/);
    console.log("Failing required test: rejected by actual Jest runner.");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(`Workspace: ${[...validateWorkspace()].join(", ")}`);
  if (process.argv.includes("--self-test")) selfTest();
}
