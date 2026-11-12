import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ESLint } from "eslint";

const roots = [];
async function temporary(parent, prefix) {
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(path.join(parent, prefix));
  roots.push(dir);
  return dir;
}
async function put(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}
const eslint = new ESLint();
async function expectLint(file, source, shouldFail, label) {
  await put(file, source);
  const results = await eslint.lintFiles([file]);
  const errors = results.flatMap((result) =>
    result.messages.filter((message) => message.severity === 2),
  );
  if (
    errors.length > 0 !== shouldFail ||
    (shouldFail &&
      !errors.some((error) =>
        error.ruleId?.startsWith(
          label.startsWith("Backend") ? "architecture/" : "fsd/",
        ),
      ))
  )
    throw new Error(
      `${label}: expected ${shouldFail ? "rejection" : "success"}, got ${JSON.stringify(errors)}`,
    );
  console.log(`${label}: ${shouldFail ? "rejected" : "accepted"}`);
}
try {
  const features = path.resolve("apps/web/src/features");
  const entities = path.resolve("apps/web/src/entities");
  const a = await temporary(features, "architecture-a-");
  const b = await temporary(features, "architecture-b-");
  const entity = await temporary(entities, "architecture-entity-");
  const aName = path.basename(a),
    bName = path.basename(b),
    entityName = path.basename(entity);
  await put(path.join(b, "index.ts"), "export const value = 1;\n");
  await put(path.join(b, "model", "private.ts"), "export const value = 1;\n");
  await put(path.join(entity, "index.ts"), "export const value = 1;\n");
  const web = path.join(a, "ui", "probe.ts");
  await expectLint(
    web,
    `import { value } from '@/features/${bName}/model/private';\nexport { value };\n`,
    true,
    "FSD cross-slice",
  );
  await expectLint(
    path.join(entity, "probe.ts"),
    `import { value } from '@/features/${aName}';\nexport { value };\n`,
    true,
    "FSD upward layer",
  );
  await expectLint(
    web,
    `import { value } from '@/entities/${entityName}';\nexport { value };\n`,
    false,
    "FSD valid lower layer",
  );
  const modules = path.resolve("apps/api/src/modules");
  const apiA = await temporary(modules, "architecture-a-");
  const apiB = await temporary(modules, "architecture-b-");
  const apiName = path.basename(apiB);
  await put(path.join(apiB, "index.ts"), "export const value = 1;\n");
  await put(
    path.join(apiB, "infrastructure", "private.ts"),
    "export const value = 1;\n",
  );
  const api = path.join(apiA, "probe.ts");
  await expectLint(
    api,
    `import { value } from '@modules/${apiName}/infrastructure/private';\nexport { value };\n`,
    true,
    "Backend deep import",
  );
  await expectLint(
    api,
    `import { value } from '@modules/${apiName}';\nexport { value };\n`,
    false,
    "Backend public import",
  );
  await expectLint(
    api,
    `import { value } from '../${apiName}/index.js';\nexport { value };\n`,
    false,
    "Backend ESM public import",
  );
  await expectLint(
    api,
    `import { value } from '../${apiName}/infrastructure/private.js';\nexport { value };\n`,
    true,
    "Backend ESM deep import",
  );
  const domain = path.join(apiA, "domain", "probe.ts");
  for (const dependency of ["fastify", "@fastify/cookie", "@prisma/client"]) {
    await expectLint(
      domain,
      `import type { value } from '${dependency}';\nexport type { value };\n`,
      true,
      `Backend domain rejects ${dependency}`,
    );
  }
  await expectLint(
    domain,
    `import { value } from '../../../generated/prisma/client.js';\nexport { value };\n`,
    true,
    "Backend domain rejects generated Prisma",
  );
  await expectLint(
    api,
    `import { value } from '../../../../web/src/features/${bName}/index';\nexport { value };\n`,
    true,
    "Backend cross-app import",
  );
  await put(path.join(apiA, "cycle-a.ts"), "import './cycle-b';\n");
  await put(path.join(apiA, "cycle-b.ts"), "import './cycle-a';\n");
  const executable = path.resolve(
    "node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
  );
  const cycle = spawnSync(
    process.execPath,
    [executable, apiA, "--config", ".dependency-cruiser.cjs"],
    { encoding: "utf8" },
  );
  if (cycle.status === 0 || !cycle.stdout.includes("no-cycles"))
    throw new Error(`cycle was not detected: ${cycle.stdout} ${cycle.stderr}`);
  console.log("Circular dependency: rejected");
} finally {
  for (const root of roots) await rm(root, { recursive: true, force: true });
}
