import { randomBytes } from "node:crypto";

export type Part =
  | { name: string; value: string }
  | {
      name: string;
      fileName: string;
      contentType?: string;
      bytes: Uint8Array;
    };

/** Builds a raw multipart/form-data body with full control over part order. */
export function multipart(
  parts: Part[],
  options: { terminate?: boolean } = {},
) {
  const boundary = `----agency${randomBytes(8).toString("hex")}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ("bytes" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\n` +
            `Content-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`,
        ),
        Buffer.from(part.bytes),
        Buffer.from("\r\n"),
      );
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`,
        ),
        Buffer.from(part.value, "utf8"),
        Buffer.from("\r\n"),
      );
    }
  }
  if (options.terminate !== false)
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
