/** Widths are measured by the actual embedded standard font, not character counts. */
export function wrapText(
  text: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  if (!Number.isFinite(width) || width <= 0)
    throw new Error("Impossible text width.");
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (measure(word) > width)
        throw new Error("Unbreakable word exceeds content width.");
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) > width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}
