import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { rootDirectory } from "../env.mjs";

const require = createRequire(import.meta.url);
const commitlintCli = require.resolve("@commitlint/cli/cli.js", {
  paths: [rootDirectory],
});

function lint(message) {
  return spawnSync(process.execPath, [commitlintCli], {
    cwd: rootDirectory,
    input: message,
    encoding: "utf8",
  });
}

test("commit-msg hook accepts Conventional Commits without creating a commit", () => {
  for (const message of [
    "feat(api): add authorized multipart upload",
    "fix(web): keep focus in delete dialog",
    "test(e2e): prove all agency acceptance journeys",
  ])
    assert.equal(lint(message).status, 0, message);
});

test("commit-msg hook rejects non-conventional messages", () => {
  for (const message of ["added stuff", "Feat: Upper case type", "feat:"])
    assert.notEqual(lint(message).status, 0, message);
});

test("hooks run the documented commands and prepare skips without Git", () => {
  assert.match(
    readFileSync(new URL("../../.husky/commit-msg", import.meta.url), "utf8"),
    /commitlint --edit "\$1"/,
  );
  assert.match(
    readFileSync(new URL("../../.husky/pre-commit", import.meta.url), "utf8"),
    /lint-staged/,
  );
  const prepare = spawnSync(process.execPath, ["tooling/prepare.mjs"], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
  if (!readdirHasGit())
    assert.match(prepare.stdout, /skipped \(no Git repository\)/);
  assert.equal(prepare.status, 0);
});

function readdirHasGit() {
  try {
    readFileSync(new URL("../../.git/HEAD", import.meta.url));
    return true;
  } catch {
    return false;
  }
}
