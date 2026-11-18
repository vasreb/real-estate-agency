import {
  matchRecord,
  normalizeText,
  queryTokens,
} from "../../src/modules/assistant/domain/record-matching.js";

const deal = {
  number: "2025-086",
  address: "12 Harbour Street, Apt 4B, Northbridge",
  clientName: "Vale Holdings Ltd",
};

describe("record matching", () => {
  it("normalizes case, spacing and punctuation", () => {
    expect(normalizeText("  12,  Harbour-Street!! ")).toBe("12 harbour street");
  });

  it("drops filler words but keeps identifying tokens", () => {
    expect(queryTokens("commission for deal 2025-086")).toEqual([
      "commission",
      "2025",
      "086",
    ]);
  });

  it("scores an exact deal number highest, even inside a sentence", () => {
    expect(matchRecord(queryTokens("deal 2025-086"), deal)).toEqual({
      score: 100,
      matchedBy: "deal_number",
      complete: true,
    });
    expect(
      matchRecord(queryTokens("what is the commission on 2025-086?"), deal),
    ).toMatchObject({ score: 100 });
  });

  it("matches a number suffix lower than a full number", () => {
    expect(matchRecord(queryTokens("deal 086"), deal)).toEqual({
      score: 80,
      matchedBy: "deal_number",
      complete: true,
    });
  });

  it("matches parts of an address in proportion to the words found", () => {
    const both = matchRecord(queryTokens("harbour street 12"), deal);
    const one = matchRecord(queryTokens("harbour nowhere"), deal);
    expect(both?.matchedBy).toBe("address");
    expect(both!.score).toBeGreaterThan(one!.score);
  });

  it("does not match unrelated text and can match the client", () => {
    expect(matchRecord(queryTokens("zzz qqq"), deal)).toBeNull();
    expect(matchRecord(queryTokens("vale holdings"), deal)).toMatchObject({
      matchedBy: "client",
    });
    expect(matchRecord([], deal)).toBeNull();
  });

  it("tells a full name match from a shared first name", () => {
    // "Vale Holdings" is the client: both words match, so it is complete.
    expect(matchRecord(queryTokens("vale holdings"), deal)?.complete).toBe(
      true,
    );
    // Only one of two words matches (a shared first name): not complete.
    const partial = matchRecord(queryTokens("vale smith"), deal);
    expect(partial).toMatchObject({ matchedBy: "client", complete: false });
  });
});
