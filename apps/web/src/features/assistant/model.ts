import type {
  ChatCitation,
  ChatRequest,
  ChatResponse,
} from "@agency/contracts";

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ChatState = ChatRequest["state"];

const MAX_HISTORY = 20;
const MAX_TURN_CHARS = 8000;

/**
 * Builds the request from the visible conversation. Only plain text of earlier
 * turns is sent; citations and tool data never travel back to the server.
 */
export function toChatRequest(input: {
  teamId: string;
  turns: ChatTurn[];
  state: ChatState;
}): ChatRequest | null {
  const turns = input.turns.filter((turn) => turn.text.trim().length > 0);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return null;
  const history = turns
    .slice(0, -1)
    .slice(-MAX_HISTORY)
    .map((turn) => ({
      role: turn.role,
      content: turn.text.trim().slice(0, MAX_TURN_CHARS),
    }));
  // The service requires the history to start with a user turn.
  while (history[0] && history[0].role !== "user") history.shift();
  return {
    team_id: input.teamId,
    message: last.text.trim().slice(0, 4000),
    history,
    state: input.state,
  };
}

/** Answer text with `[n]` markers after the parts the citations support. */
export function answerText(response: ChatResponse): string {
  return response.answer
    .map((part) =>
      part.citations.length > 0
        ? `${part.text} ${part.citations.map((id) => `[${id}]`).join("")}`
        : part.text,
    )
    .join("")
    .trim();
}

export type CitationView = ChatCitation;

/** A short extract of a cited passage; the whole page is one click away. */
export function shortQuote(quote: string, max = 240): string {
  const text = quote.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export function pagesLabel(citation: {
  page_start: number;
  page_end: number;
}): string {
  return citation.page_start === citation.page_end
    ? `p. ${citation.page_start}`
    : `pp. ${citation.page_start}–${citation.page_end}`;
}
