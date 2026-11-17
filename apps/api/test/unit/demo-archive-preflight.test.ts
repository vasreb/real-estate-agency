import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeOuterZip } from "../../prisma/demo-archive/archive/pack.js";
import { scanArchive } from "../../prisma/demo-archive/archive/read.js";
import { digestBytes } from "../../prisma/demo-archive/build.js";
import { ownedOutputPath } from "../../prisma/demo-archive/policy.js";
import { assertArchiveEntry } from "../../prisma/demo-archive/archive/path-policy.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("hostile outer ZIP preflight", () => {
  const root = ownedOutputPath(
    `out/agency-demo-archive/qa/preflight-${process.pid}`,
  );
  it("reads more entries than the production DOCX cap under its own outer policy", async () => {
    mkdirSync(root, { recursive: true });
    const file = path.join(root, "many.zip");
    await writeOuterZip(
      file,
      Array.from({ length: 2050 }, (_, i) => ({
        name: `file-${String(i).padStart(4, "0")}.json`,
        data: Buffer.from("{}\n"),
      })),
    );
    const received: string[] = [];
    const result = await scanArchive(
      file,
      digestBytes(readFileSync(file)),
      (name) => {
        received.push(name);
        return Promise.resolve();
      },
    );
    expect(received).toHaveLength(2050);
    expect(result.entries).toBe(2050);
    recordScenario(15, "happy", {
      outer_entries_accepted: result.entries,
      database_calls: 0,
    });
  });
  it("rejects unsafe Windows aliases, collisions, links and encryption", () => {
    for (const name of [
      "../escape",
      "C:/drive",
      "//server/share",
      "a:stream",
      "CON.txt",
      "x. ",
      "x.",
      "e\u0301.json",
      "a\\b",
      "/root",
    ])
      expect(() =>
        assertArchiveEntry(
          { name, flags: 0x800, mode: 0o100644, compressed: 1, expanded: 1 },
          new Set(),
        ),
      ).toThrow();
    const seen = new Set<string>();
    assertArchiveEntry(
      {
        name: "Case.json",
        flags: 0x800,
        mode: 0o100644,
        compressed: 1,
        expanded: 1,
      },
      seen,
    );
    expect(() =>
      assertArchiveEntry(
        {
          name: "case.json",
          flags: 0x800,
          mode: 0o100644,
          compressed: 1,
          expanded: 1,
        },
        seen,
      ),
    ).toThrow();
    for (const fields of [
      { flags: 0x801 },
      { mode: 0o120777 },
      { compressed: 1, expanded: 101 },
      { expanded: 33 * 1024 ** 2 },
    ])
      expect(() =>
        assertArchiveEntry(
          {
            name: "x.json",
            flags: 0x800,
            mode: 0o100644,
            compressed: 1,
            expanded: 1,
            ...fields,
          },
          new Set(),
        ),
      ).toThrow();
  });
  it("rejects a wrong external digest, substituted bytes and mismatched CRC before a successful scan", async () => {
    const file = path.join(root, "small.zip");
    await writeOuterZip(file, [
      { name: "test.json", data: Buffer.from("{}\n") },
    ]);
    let calls = 0;
    await expect(
      scanArchive(file, "0".repeat(64), () => {
        calls++;
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    const data = readFileSync(file);
    const broken = Buffer.from(data);
    broken[40] = broken[40]! ^ 1;
    const altered = path.join(root, "altered.zip");
    writeFileSync(altered, broken);
    await expect(
      scanArchive(altered, digestBytes(data), () => Promise.resolve()),
    ).rejects.toThrow();
    await expect(
      scanArchive(altered, digestBytes(broken), () => Promise.resolve()),
    ).rejects.toThrow();
    recordScenario(15, "failure", {
      unsafe_paths_and_modes: true,
      wrong_digest_and_crc_rejected: true,
      database_calls: 0,
    });
  });
});
