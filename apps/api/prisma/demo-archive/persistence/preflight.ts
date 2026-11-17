import { writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyArchive } from "../archive/verify.js";
import { stableJson } from "../model.js";
import { evidenceRoot } from "../policy.js";

export async function preflightArchive(input: string, expectedSha256: string) {
  const result = await verifyArchive(input, expectedSha256);
  await writeFile(
    path.join(evidenceRoot, "task-15-preflight.json"),
    stableJson(result.receipt),
  );
  return result;
}
