const MAX_NAME_CHARS = 255;
// C0 controls, DEL, C1 controls, bidi embeddings/overrides and isolates.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/gu;

/**
 * Returns a safe display basename. Pure string handling: never touches the
 * filesystem, and the result must not be used as a storage path.
 */
export function normalizeFileName(raw: string): string {
  const segments = raw.split(/[\\/]/u);
  const base = (segments[segments.length - 1] ?? "")
    .normalize("NFC")
    .replace(FORBIDDEN, "")
    .trim();
  if (base === "" || base === "." || base === "..") return "document";
  const chars = Array.from(base);
  if (chars.length <= MAX_NAME_CHARS) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? Array.from(base.slice(dot)) : [];
  if (ext.length > 0 && ext.length <= 32) {
    const head = Array.from(base.slice(0, dot)).slice(
      0,
      MAX_NAME_CHARS - ext.length,
    );
    return head.join("") + ext.join("");
  }
  return chars.slice(0, MAX_NAME_CHARS).join("");
}
