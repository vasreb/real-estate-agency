import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";
import { rootDirectory } from "../env.mjs";
import { prepareHooks } from "../prepare.mjs";

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
  const directory = mkdtempSync(path.join(tmpdir(), "agency-hooks-no-git-"));
  try {
    const prepare = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../prepare.mjs", import.meta.url))],
      {
        cwd: directory,
        encoding: "utf8",
      },
    );
    assert.match(prepare.stdout, /skipped \(no Git repository\)/);
    assert.equal(prepare.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("linked-worktree Git file dispatches installed Husky without changing real Git config", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agency-hooks-worktree-"));
  try {
    writeFileSync(path.join(directory, ".git"), "gitdir: fixture-only\n");
    const calls = [];
    const status = prepareHooks({
      cwd: directory,
      run: (...args) => {
        calls.push(args);
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], process.execPath);
    assert.equal(path.basename(calls[0][1][0]), "bin.js");
    assert.equal(existsSync(calls[0][1][0]), true);
    assert.equal(calls[0][2].cwd, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
