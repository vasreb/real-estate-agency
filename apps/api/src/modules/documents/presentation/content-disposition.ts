// Control characters and bidi overrides/isolates are stripped from file names.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

/**
 * RFC 6266 attachment header with an ASCII fallback and an RFC 5987 UTF-8
 * `filename*`. Control characters, quotes, backslashes and path separators
 * never reach the header.
 */
function dispositionHeader(
  disposition: "attachment" | "inline",
  fileName: string,
): string {
  const cleaned =
    fileName
      .normalize("NFC")
      .replace(UNSAFE, "")
      .replace(/[/\\]/g, "_")
      .trim() || "document";
  const fallback = cleaned.replace(/[^\x20-\x7e]|["%]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const attachmentHeader = (fileName: string) =>
  dispositionHeader("attachment", fileName);
/** Same sanitising, for in-browser viewing (citation preview). */
export const inlineHeader = (fileName: string) =>
  dispositionHeader("inline", fileName);
