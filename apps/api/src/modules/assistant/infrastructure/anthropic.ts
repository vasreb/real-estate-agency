import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "../application/assistant-service.js";

/**
 * Claude through the official SDK. With `onText` the reply is streamed, so the
 * first words reach the employee while the rest is still being written; the
 * complete message (with citations) is what the caller gets back either way.
 * Aborting the signal stops the request, so a closed tab stops costing money.
 */
export function createAnthropicLlm(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    createMessage: (params, options) => {
      const requestOptions = options?.signal
        ? { signal: options.signal }
        : undefined;
      if (!options?.onText)
        return client.messages.create(params, requestOptions);
      const onText = options.onText;
      const stream = client.messages.stream(params, requestOptions);
      stream.on("text", (delta) => onText(delta));
      return stream.finalMessage();
    },
  };
}
