import {
  clauseNumbers,
  clauseReferenceQuery,
} from "../../src/modules/assistant/application/document-search.js";

describe("clauseNumbers", () => {
  it("reads the section and every numbered heading line", () => {
    expect(
      clauseNumbers("4.2", "4.2 Notice\nText.\n4.3. Fees\nMore\n7. Term"),
    ).toEqual(["4.2", "4.3", "7"]);
  });

  it("understands clause words and ignores plain numbers in sentences", () => {
    expect(
      clauseNumbers("Clause 5.1", "The rent is\n250 pounds a week"),
    ).toEqual(["5.1"]);
    expect(clauseNumbers(null, "Paid on 12 May\nSection 9 applies")).toEqual([
      "9",
    ]);
  });

  it("returns nothing for text without numbered headings", () => {
    expect(clauseNumbers(null, "Plain text only")).toEqual([]);
  });
});

describe("clauseReferenceQuery", () => {
  it("matches the usual ways of citing a clause", () => {
    expect(clauseReferenceQuery(["4.2"])).toBe(
      '"clause 4.2" or "section 4.2" or "paragraph 4.2" or "article 4.2"',
    );
  });
});
