import type { ChatModelAdapter, ThreadMessage } from "@assistant-ui/react";
import { errorMessage, type ApiClient } from "@/shared/api";
import {
  answerText,
  toChatRequest,
  type ChatState,
  type ChatTurn,
  type CitationView,
} from "./model";
import { readEvents } from "./stream";

export type ChatScope = { teamId: string };

function turnsOf(messages: readonly ThreadMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    // Failed or cancelled answers are not part of the conversation.
    if (message.role === "assistant" && message.status?.type === "incomplete")
      continue;
    turns.push({ role: message.role, text });
  }
  return turns;
}

export const CITATIONS_KEY = "citations";
export const STAGE_KEY = "stage";

const failure = (text: string) => ({
  content: [{ type: "text" as const, text }],
  status: { type: "incomplete" as const, reason: "error" as const },
});

/**
 * Streaming adapter for POST /api/chat/stream. Text appears while the model
 * writes it; the final event replaces it with the checked answer and its
 * citations. The IDs the server surfaced are echoed back with the next
 * question; access is re-checked on the server.
 */
export function createChatAdapter(
  api: ApiClient,
  scope: ChatScope,
): ChatModelAdapter {
  let state: ChatState = { deal_ids: [], document_ids: [] };
  return {
    async *run({ messages, abortSignal }) {
      const request = toChatRequest({
        teamId: scope.teamId,
        turns: turnsOf(messages),
        state,
      });
      if (!request) {
        yield failure("Please type a question.");
        return;
      }
      let text = "";
      try {
        const stream = await api.chatStream(request, abortSignal);
        for await (const event of readEvents(stream)) {
          if (event.type === "status") {
            yield {
              content: [{ type: "text", text }],
              metadata: { custom: { [STAGE_KEY]: event.stage } },
            };
          } else if (event.type === "delta") {
            text += event.text;
            yield { content: [{ type: "text", text }] };
          } else if (event.type === "reset") {
            text = "";
            yield { content: [{ type: "text", text }] };
          } else if (event.type === "final") {
            state = event.response.state;
            yield {
              content: [{ type: "text", text: answerText(event.response) }],
              status: { type: "complete", reason: "stop" },
              metadata: {
                custom: {
                  [CITATIONS_KEY]: event.response
                    .citations satisfies CitationView[],
                },
              },
            };
            return;
          } else {
            yield failure(event.message);
            return;
          }
        }
        // The connection ended without a final answer (dropped, proxy cut).
        yield failure("The answer was interrupted. Please try again.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          throw error;
        yield failure(errorMessage(error));
      }
    },
  };
}
