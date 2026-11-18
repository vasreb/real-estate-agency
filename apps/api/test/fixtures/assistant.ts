import { createHash } from "node:crypto";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import type { LlmClient } from "../../src/modules/assistant/index.js";
import type { Embedder } from "../../src/modules/indexing/index.js";

const DIMENSIONS = 1024;

/** Deterministic bag-of-words embedding: texts sharing words are close. */
export function fakeVector(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const bucket = createHash("sha256").update(word).digest().readUInt16BE(0);
    const index = bucket % DIMENSIONS;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export const fakeEmbedder: Embedder = {
  model: "fake-embedder",
  dimensions: DIMENSIONS,
  embed: (texts) => Promise.resolve(texts.map(fakeVector)),
};

export type ModelStep = (
  request: MessageCreateParamsNonStreaming,
) => Pick<Message, "content" | "stop_reason"> &
  Partial<{ input: number; output: number }>;

/** Replays scripted model turns and records every request it receives. */
export function scriptedModel(steps: ModelStep[]) {
  const requests: MessageCreateParamsNonStreaming[] = [];
  const calls: { streamed: boolean; signal: AbortSignal | undefined }[] = [];
  const llm: LlmClient = {
    createMessage(request, options) {
      requests.push(request);
      calls.push({
        streamed: Boolean(options?.onText),
        signal: options?.signal,
      });
      const step = steps[Math.min(requests.length - 1, steps.length - 1)]!;
      const result = step(request);
      // A streamed call reports its text in pieces, as the real model does.
      for (const block of result.content)
        if (options?.onText && block.type === "text") {
          const middle = Math.ceil(block.text.length / 2);
          for (const piece of [
            block.text.slice(0, middle),
            block.text.slice(middle),
          ])
            if (piece) options.onText(piece);
        }
      return Promise.resolve({
        id: `msg_${requests.length}`,
        type: "message",
        role: "assistant",
        model: request.model,
        content: result.content,
        stop_reason: result.stop_reason,
        stop_sequence: null,
        usage: {
          input_tokens: result.input ?? 100,
          output_tokens: result.output ?? 10,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      } as unknown as Message);
    },
  };
  return { llm, requests, calls };
}

export const toolUse =
  (name: string, input: unknown, id = `toolu_${name}`): ModelStep =>
  () => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }] as Message["content"],
  });

export const finalText =
  (text: string, citations: unknown[] = []): ModelStep =>
  () => ({
    stop_reason: "end_turn",
    content: [
      { type: "text", text, citations },
    ] as unknown as Message["content"],
  });

/** The tool_result blocks the assistant sent back in the last request. */
export function lastToolResult(request: MessageCreateParamsNonStreaming): {
  text: string[];
  sources: string[];
  isError: boolean;
} {
  const last = request.messages[request.messages.length - 1]!;
  const blocks = Array.isArray(last.content) ? last.content : [];
  const result = blocks.find((block) => block.type === "tool_result");
  if (!result || result.type !== "tool_result")
    throw new Error("No tool result in the request");
  const content = Array.isArray(result.content) ? result.content : [];
  // The overview travels as a search_result too; tests read it as text.
  const isOverview = (block: { type: string }) =>
    block.type === "search_result" &&
    (block as { source?: string }).source === "overview:search";
  return {
    text: content.flatMap((block) =>
      block.type === "text"
        ? [block.text]
        : isOverview(block) && block.type === "search_result"
          ? block.content.map((part) => part.text)
          : [],
    ),
    sources: content.flatMap((block) =>
      block.type === "search_result" && !isOverview(block)
        ? [block.source]
        : [],
    ),
    isError: result.is_error === true,
  };
}
