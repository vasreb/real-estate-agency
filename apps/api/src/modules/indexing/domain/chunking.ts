/** Text of one source page; `page` is 1-based and matches the original file. */
export type PageText = { page: number; text: string };

export type Chunk = {
  ordinal: number;
  pageStart: number;
  pageEnd: number;
  /** Clause or heading the chunk starts in, when one was recognised. */
  section: string | null;
  content: string;
};

export const MAX_CHUNK_CHARS = 1800;
const MIN_CHUNK_CHARS = 300;
const MAX_SECTION_CHARS = 120;

/** "1.", "2.3", "Article 4", "Section 5.1", "Clause 7", "Schedule A". */
const HEADING =
  /^(?:(?:article|section|clause|schedule|appendix|annex)\s+[\w.-]+|\d+(?:\.\d+)*\.?)(?=\s|$|[.:])/i;

type Line = { page: number; text: string };

function splitLongLine(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK_CHARS) {
    // Prefer a sentence or word boundary before the limit.
    const window = rest.slice(0, MAX_CHUNK_CHARS);
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("; "),
      window.lastIndexOf(" "),
    );
    const at = cut > MAX_CHUNK_CHARS / 2 ? cut + 1 : MAX_CHUNK_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Splits page texts into retrieval chunks. A chunk never exceeds
 * MAX_CHUNK_CHARS, starts a new chunk at a clause heading once it has enough
 * content, and keeps the first and last page it spans.
 */
export function chunkPages(pages: PageText[]): Chunk[] {
  const lines: Line[] = [];
  for (const { page, text } of pages)
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line)
        for (const part of splitLongLine(line))
          lines.push({ page, text: part });
    }

  const chunks: Chunk[] = [];
  let current: { lines: Line[]; section: string | null } | undefined;
  let activeSection: string | null = null;

  const length = (value: typeof current) =>
    value
      ? value.lines.reduce((sum, line) => sum + line.text.length + 1, 0)
      : 0;
  const flush = () => {
    if (!current || current.lines.length === 0) return;
    const first = current.lines[0]!;
    const last = current.lines[current.lines.length - 1]!;
    chunks.push({
      ordinal: chunks.length + 1,
      pageStart: first.page,
      pageEnd: last.page,
      section: current.section,
      content: current.lines.map((line) => line.text).join("\n"),
    });
    current = undefined;
  };

  for (const line of lines) {
    const heading = HEADING.test(line.text);
    if (heading) activeSection = line.text.slice(0, MAX_SECTION_CHARS);
    const size = length(current);
    if (
      current &&
      ((heading && size >= MIN_CHUNK_CHARS) ||
        size + line.text.length + 1 > MAX_CHUNK_CHARS)
    )
      flush();
    current ??= { lines: [], section: activeSection };
    current.lines.push(line);
  }
  flush();
  return chunks;
}
