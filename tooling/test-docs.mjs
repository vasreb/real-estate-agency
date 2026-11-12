// Documentation validator:
//  - relative Markdown links resolve;
//  - every `pnpm <script>` mentioned in docs exists in the root package.json
//    (or is a pnpm built-in);
//  - the acceptance matrix covers acceptance clauses 1–5 and IS-1…IS-6 and every
//    evidence file it cites exists.
// `--self-test` proves rejection on isolated broken fixtures.
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MATRIX = ".omo/evidence/agency-base-implementation/acceptance-matrix.md";
const BUILTINS = new Set([
  "install",
  "exec",
  "add",
  "run",
  "dlx",
  "store",
  "why",
  "--filter",
  "-r",
  "-F",
]);

function markdownFiles(root) {
  const files = [
    "README.md",
    "AGENTS.md",
    "apps/api/AGENTS.md",
    "apps/web/AGENTS.md",
  ].filter((f) => existsSync(path.join(root, f)));
  const walk = (dir) => {
    const absolute = path.join(root, dir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "references") walk(relative);
      } else if (entry.name.endsWith(".md")) files.push(relative);
    }
  };
  walk("docs");
  return files;
}

export function validate(root) {
  const errors = [];
  const scripts = new Set(
    Object.keys(
      JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
        .scripts ?? {},
    ),
  );
  for (const file of markdownFiles(root)) {
    const text = readFileSync(path.join(root, file), "utf8");
    if (file.startsWith(path.join("docs", "templates"))) continue;
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const clean = decodeURIComponent(target.split("#")[0]);
      if (!clean) continue;
      if (!existsSync(path.resolve(path.join(root, path.dirname(file)), clean)))
        errors.push(`${file}: broken link ${target}`);
    }
    for (const [, script] of text.matchAll(/`pnpm ([a-z][\w:-]*)/g))
      if (!scripts.has(script) && !BUILTINS.has(script))
        errors.push(`${file}: unknown command pnpm ${script}`);
  }
  const matrixPath = path.join(root, MATRIX);
  if (!existsSync(matrixPath)) errors.push(`${MATRIX}: missing`);
  else {
    const matrix = readFileSync(matrixPath, "utf8");
    for (const row of [
      "AC-1",
      "AC-2",
      "AC-3",
      "AC-4",
      "AC-5",
      "IS-1",
      "IS-2",
      "IS-3",
      "IS-4",
      "IS-5",
      "IS-6",
    ])
      if (!new RegExp(`^\\|\\s*${row}\\s*\\|`, "m").test(matrix))
        errors.push(`${MATRIX}: no row ${row}`);
    for (const [, evidence] of matrix.matchAll(
      /`((?:task-|final-|stage-)[\w.-]+\.(?:log|md))`/g,
    ))
      if (!existsSync(path.join(path.dirname(matrixPath), evidence)))
        errors.push(`${MATRIX}: missing evidence ${evidence}`);
    for (const [, spec] of matrix.matchAll(
      /`((?:apps|tooling)\/[\w./-]+\.(?:ts|tsx|mjs))`/g,
    ))
      if (!existsSync(path.join(root, spec)))
        errors.push(`${MATRIX}: missing test file ${spec}`);
  }
  return errors;
}

function selfTest() {
  const fixture = mkdtempSync(path.join(tmpdir(), "agency-docs-"));
  const write = (relative, content) => {
    mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
    writeFileSync(path.join(fixture, relative), content);
  };
  const rows = [
    "AC-1",
    "AC-2",
    "AC-3",
    "AC-4",
    "AC-5",
    "IS-1",
    "IS-2",
    "IS-3",
    "IS-4",
    "IS-5",
    "IS-6",
  ]
    .map((row) => `| ${row} | \`task-1-happy.log\` |`)
    .join("\n");
  try {
    write("package.json", JSON.stringify({ scripts: { verify: "x" } }));
    write("README.md", "Run `pnpm verify`. See [ops](docs/ops.md).\n");
    write("docs/ops.md", "ok\n");
    write(MATRIX, `${rows}\n`);
    write(path.join(path.dirname(MATRIX), "task-1-happy.log"), "ok");
    const valid = validate(fixture);
    if (valid.length)
      throw new Error(`self-test: valid fixture rejected: ${valid.join("; ")}`);
    const cases = [
      [
        "broken link",
        () => write("README.md", "See [x](docs/missing.md).\n"),
        /broken link/,
      ],
      [
        "unknown command",
        () => write("README.md", "Run `pnpm deploy:prod`.\n"),
        /unknown command/,
      ],
      [
        "missing row",
        () => write(MATRIX, rows.replace("| IS-6 |", "| IS-X |")),
        /no row IS-6/,
      ],
      [
        "missing evidence",
        () => write(MATRIX, `${rows}\n| x | \`task-99-happy.log\` |\n`),
        /missing evidence/,
      ],
    ];
    for (const [name, mutate, expected] of cases) {
      write("README.md", "Run `pnpm verify`.\n");
      write(MATRIX, `${rows}\n`);
      mutate();
      const errors = validate(fixture);
      if (!errors.some((e) => expected.test(e)))
        throw new Error(
          `self-test: ${name} not rejected (${errors.join("; ") || "no errors"})`,
        );
      console.log(`PASS self-test rejects ${name}`);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const errors = validate(repoRoot);
  if (errors.length) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exitCode = 1;
  } else
    console.log(
      `PASS docs: ${markdownFiles(repoRoot).length} files, links, commands and acceptance matrix`,
    );
}
