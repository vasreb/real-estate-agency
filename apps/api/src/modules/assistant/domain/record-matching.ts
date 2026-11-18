/** Lower case, punctuation to spaces, single spaces. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words that carry no identifying information in a record lookup. */
const STOP_WORDS = new Set([
  "deal",
  "number",
  "no",
  "property",
  "address",
  "at",
  "on",
  "the",
  "of",
  "for",
  "street",
  "str",
  "сделка",
  "сделке",
  "номер",
  "адрес",
  "объект",
  "по",
  "на",
]);

export function queryTokens(query: string): string[] {
  return [
    ...new Set(
      normalizeText(query)
        .split(" ")
        .filter((token) => token.length > 0 && !STOP_WORDS.has(token)),
    ),
  ];
}

/** True when `part` appears in `tokens` as one contiguous run. */
function containsSequence(tokens: string[], part: string[]): boolean {
  if (part.length === 0 || part[0] === "") return false;
  for (let start = 0; start + part.length <= tokens.length; start++)
    if (part.every((value, offset) => tokens[start + offset] === value))
      return true;
  return false;
}

export type RecordCandidate = {
  number: string;
  address: string;
  clientName: string;
};

export type RecordMatch = {
  score: number;
  matchedBy: "deal_number" | "address" | "client";
  /** Every word of the query was found: not just a shared first name. */
  complete: boolean;
};

/**
 * Scores one deal against the query tokens. An exact deal number is the
 * strongest signal; a number suffix ("086" for "2025-086") and address words
 * follow. Returns null when nothing matches.
 */
export function matchRecord(
  tokens: string[],
  candidate: RecordCandidate,
): RecordMatch | null {
  if (tokens.length === 0) return null;
  const number = normalizeText(candidate.number);
  const numberParts = number.split(" ");
  const address = normalizeText(candidate.address);
  const client = normalizeText(candidate.clientName);

  if (containsSequence(tokens, numberParts))
    return { score: 100, matchedBy: "deal_number", complete: true };
  if (
    tokens.some(
      (token) =>
        /\d/.test(token) && numberParts[numberParts.length - 1] === token,
    )
  )
    return { score: 80, matchedBy: "deal_number", complete: true };

  const addressHits = tokens.filter((token) => address.includes(token)).length;
  if (addressHits > 0)
    return {
      score: Math.round((50 * addressHits) / tokens.length),
      matchedBy: "address",
      complete: addressHits === tokens.length,
    };
  const clientHits = tokens.filter((token) => client.includes(token)).length;
  if (clientHits > 0)
    return {
      score: Math.round((20 * clientHits) / tokens.length),
      matchedBy: "client",
      complete: clientHits === tokens.length,
    };
  return null;
}
