import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeOuterZip } from "../../prisma/demo-archive/archive/pack.js";
import { ownedOutputPath } from "../../prisma/demo-archive/policy.js";
import { digestBytes } from "../../prisma/demo-archive/build.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("deterministic outer release ZIP writer", () => {
  const output = ownedOutputPath(
    `out/agency-demo-archive/qa/pack-${process.pid}`,
  );
  it("writes sorted fixed-date ZIPs byte-identically without retaining all originals", async () => {
    mkdirSync(output, { recursive: true });
    const parts = [
      { name: "README.md", data: Buffer.from("Synthetic archive\n") },
      { name: "entities/users.json", data: Buffer.from("[]\n") },
    ];
    await writeOuterZip(path.join(output, "a.zip"), parts);
    await writeOuterZip(path.join(output, "b.zip"), [...parts].reverse());
    expect(readFileSync(path.join(output, "a.zip"))).toEqual(
      readFileSync(path.join(output, "b.zip")),
    );
    recordScenario(14, "happy", {
      fixture_zip_digest: digestBytes(readFileSync(path.join(output, "a.zip"))),
      deterministic: true,
    });
  });
  it("refuses duplicate/unsafe paths, excessive entries and overwrite", async () => {
    const part = { name: "README.md", data: Buffer.from("x") };
    for (const parts of [
      [part, part],
      [{ ...part, name: "../outside" }],
      [{ ...part, name: "CON" }],
      Array.from({ length: 4097 }, (_, i) => ({ ...part, name: `file-${i}` })),
    ])
      await expect(
        writeOuterZip(path.join(output, "refused.zip"), parts),
      ).rejects.toThrow();
    await expect(
      writeOuterZip(path.join(output, "a.zip"), [part]),
    ).rejects.toThrow();
    recordScenario(14, "failure", {
      unsafe_or_oversize_or_overwrite_rejected: 5,
    });
  });
});
