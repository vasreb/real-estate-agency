import {
  chunkPages,
  MAX_CHUNK_CHARS,
} from "../../src/modules/indexing/domain/chunking.js";

describe("chunkPages", () => {
  it("returns nothing for empty or whitespace-only pages", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([{ page: 1, text: " \n \n" }])).toEqual([]);
  });

  it("keeps a short document in one chunk with its page", () => {
    const chunks = chunkPages([
      { page: 3, text: "1. Parties\nThe landlord and the tenant." },
    ]);
    expect(chunks).toEqual([
      {
        ordinal: 1,
        pageStart: 3,
        pageEnd: 3,
        section: "1. Parties",
        content: "1. Parties\nThe landlord and the tenant.",
      },
    ]);
  });

  it("starts a new chunk at a clause heading once the chunk has enough text", () => {
    const filler = "Rent is payable monthly in advance. ".repeat(12);
    const chunks = chunkPages([
      {
        page: 1,
        text: `1. Rent\n${filler}\n2. Deposit\nThe deposit is 1200 EUR.`,
      },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.section).toBe("1. Rent");
    expect(chunks[1]?.section).toBe("2. Deposit");
    expect(chunks[1]?.content).toContain("1200 EUR");
  });

  it("does not split a short clause away from the previous text", () => {
    const chunks = chunkPages([
      { page: 1, text: "1. Term\nOne year.\n2. Rent\n1200 EUR." },
    ]);
    expect(chunks).toHaveLength(1);
  });

  it("records both page boundaries when a chunk spans pages", () => {
    const chunks = chunkPages([
      { page: 4, text: "5. Termination\nEither party may terminate" },
      { page: 5, text: "with sixty days notice." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ pageStart: 4, pageEnd: 5 });
  });

  it("never exceeds the maximum size and numbers chunks consecutively", () => {
    const long = "word ".repeat(2000);
    const chunks = chunkPages([{ page: 1, text: long }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.ordinal).toBe(index + 1);
    }
  });

  it("carries the active section into continuation chunks", () => {
    const text = `3. Maintenance\n${"The tenant keeps the premises clean. ".repeat(80)}`;
    const chunks = chunkPages([{ page: 2, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.section === "3. Maintenance")).toBe(
      true,
    );
  });
});
