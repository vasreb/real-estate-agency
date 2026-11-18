import { chatStreamEventSchema, type ChatStreamEvent } from "@agency/contracts";

/**
 * Reads the answer stream (newline-delimited JSON) as typed events. A line
 * that is not a known event is a protocol error, not something to guess at.
 */
export async function* readEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (line: string) =>
    chatStreamEventSchema.parse(JSON.parse(line) as unknown);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield parse(line);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield parse(buffer.trim());
  } finally {
    // Stops the request when the consumer leaves early (abort, error).
    await reader.cancel().catch(() => undefined);
  }
}
