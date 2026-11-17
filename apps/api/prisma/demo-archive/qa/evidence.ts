import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertNoLinkedAncestors, evidenceRoot } from "../policy.js";

export function redact(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/(DEMO_ARCHIVE_PASSWORD_\d+\s*[=:]\s*)\S+/g, "$1[REDACTED]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token|database.?url/i.test(key)
          ? "[REDACTED]"
          : redact(item),
      ]),
    );
  return value;
}

/** Scenario receipt only; a suite result must come from the actual process exit. */
export function recordScenario(
  task: number,
  scenario: "happy" | "failure",
  observations: Record<string, unknown>,
): void {
  if (!Number.isInteger(task) || task < 1 || task > 20)
    throw new Error("Invalid evidence task.");
  const target = path.join(evidenceRoot, `task-${task}-${scenario}.json`);
  assertNoLinkedAncestors(target);
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    target,
    JSON.stringify(
      {
        task,
        scenario,
        scope: "scenario assertions only; see command receipt for suite exit",
        observations: redact(observations),
      },
      null,
      2,
    ) + "\n",
  );
}
