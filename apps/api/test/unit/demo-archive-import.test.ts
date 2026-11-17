import { resolveImportTarget } from "../../prisma/demo-archive/persistence/target.js";
import { readPasswords } from "../../prisma/demo-archive/persistence/credentials.js";
import {
  compareRows,
  compareUserIdentities,
} from "../../prisma/demo-archive/persistence/compare.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

const env = {
  NODE_ENV: "test",
  DEMO_ARCHIVE_APP_OFFLINE: "true",
  DEMO_ARCHIVE_CONTAINER: "a".repeat(64),
  DATABASE_URL:
    "postgresql://agency_archive:fixture-only@127.0.0.1:55433/agency_demo_archive",
};
describe("guarded exact atomic-import inputs", () => {
  it("accepts the explicit disposable target and exact/no-op/partial comparisons", () => {
    expect(resolveImportTarget(env, "agency_demo_archive").containerId).toBe(
      "a".repeat(64),
    );
    const rows = [
      { id: "one", role: "admin" },
      { id: "two", role: "member" },
    ];
    expect(compareRows(rows, [], (r) => r.id, "fixture")).toEqual(rows);
    expect(compareRows(rows, rows, (r) => r.id, "fixture")).toEqual([]);
    expect(compareRows(rows, [rows[0]!], (r) => r.id, "fixture")).toEqual([
      rows[1],
    ]);
    expect(
      compareUserIdentities(
        [{ id: "one", email: "one@example.test" }],
        [
          {
            id: "one",
            email: "one@example.test",
            passwordHash: "keep-unchanged",
          },
        ],
      ),
    ).toEqual([]);
    recordScenario(16, "happy", {
      target_guard: true,
      exact_noop: true,
      matching_partial_completion: true,
      credential_rotation: false,
      real_transaction_proof: "separate integration receipt required",
    });
  });
  it("rejects remote/production/unknown/offline/credential defects before connecting", () => {
    for (const changed of [
      { NODE_ENV: "production" },
      { DATABASE_URL: env.DATABASE_URL.replace("127.0.0.1", "remote.example") },
      { DATABASE_URL: env.DATABASE_URL.replace(":55433", ":5432") },
      {
        DATABASE_URL: env.DATABASE_URL.replace("agency_demo_archive", "agency"),
      },
      { DATABASE_URL: `${env.DATABASE_URL}?schema=other` },
      { DEMO_ARCHIVE_APP_OFFLINE: "false" },
      { DEMO_ARCHIVE_CONTAINER: "" },
    ])
      expect(() =>
        resolveImportTarget({ ...env, ...changed }, "agency_demo_archive"),
      ).toThrow();
    expect(() => resolveImportTarget(env, "agency")).toThrow();
    expect(() => readPasswords({})).toThrow();
    const supplied = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `DEMO_ARCHIVE_PASSWORD_${String(i + 1).padStart(2, "0")}`,
        "unit-fixture-only-long-password",
      ]),
    );
    expect(readPasswords(supplied)).toHaveLength(10);
    expect(() =>
      readPasswords({ ...supplied, DEMO_ARCHIVE_PASSWORD_10: "short" }),
    ).toThrow();
    recordScenario(16, "failure", {
      unsafe_target_or_missing_credential_rejected: true,
      database_calls: 0,
    });
  });
  it("refuses row differences, unexpected memberships, extra documents and reused email identities", () => {
    const rows = [{ id: "one", role: "admin" }];
    expect(() =>
      compareRows(
        rows,
        [{ id: "one", role: "member" }],
        (r) => r.id,
        "memberships",
      ),
    ).toThrow();
    expect(() =>
      compareRows(
        rows,
        [...rows, { id: "extra", role: "admin" }],
        (r) => r.id,
        "memberships",
      ),
    ).toThrow();
    expect(() =>
      compareRows(
        [{ id: "one", hash: "a" }],
        [{ id: "one", hash: "b" }],
        (r) => r.id,
        "documents",
      ),
    ).toThrow();
    expect(() =>
      compareUserIdentities(
        [{ id: "one", email: "one@example.test" }],
        [{ id: "other", email: "one@example.test", passwordHash: "preserve" }],
      ),
    ).toThrow();
  });
});
