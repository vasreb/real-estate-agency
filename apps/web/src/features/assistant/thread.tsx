"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime,
} from "@assistant-ui/react";
import { Button } from "@agency/ui";
import { useMemo } from "react";
import { documentPreviewUrl, useApiClient } from "@/shared/api";
import {
  CITATIONS_KEY,
  createChatAdapter,
  STAGE_KEY,
  type ChatScope,
} from "./adapter";
import { pagesLabel, shortQuote, type CitationView } from "./model";
import { RichText } from "./rich-text";

/** Stable reference: selectors must not return a new array on every call. */
const NO_CITATIONS: CitationView[] = [];

function Citations({ citations }: { citations: CitationView[] }) {
  if (citations.length === 0) return null;
  return (
    <details className="chat-sources">
      <summary>Sources ({citations.length})</summary>
      <ol className="chat-citations" aria-label="Sources">
        {citations.map((citation) => (
          <li key={citation.id} value={citation.id}>
            <a
              href={documentPreviewUrl(
                citation.document_id,
                citation.page_start,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              [{citation.id}] {citation.title}, {pagesLabel(citation)}
            </a>
            {citation.quote && (
              <blockquote className="muted">
                {shortQuote(citation.quote)}
              </blockquote>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ChatMessage() {
  const role = useAuiState((state) => state.message.role);
  const text = useAuiState((state) =>
    state.message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(""),
  );
  const failed = useAuiState(
    (state) =>
      state.message.role === "assistant" &&
      state.message.status?.type === "incomplete",
  );
  const citations = useAuiState((state) => {
    const custom = state.message.metadata?.custom as
      Record<string, unknown> | undefined;
    const value = custom?.[CITATIONS_KEY];
    return Array.isArray(value) ? (value as CitationView[]) : NO_CITATIONS;
  });
  return (
    <div
      className={`chat-message chat-${role}`}
      data-role={role}
      role={failed ? "alert" : undefined}
    >
      {role === "assistant" ? (
        <RichText text={text} />
      ) : (
        <p className="chat-text chat-plain">{text}</p>
      )}
      {role === "assistant" && <Citations citations={citations} />}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  working: "Checking the documents…",
  searching: "Searching the documents…",
};

/** Shown until the first words of the answer arrive. */
function RunningNotice() {
  const running = useAuiState((state) => state.thread.isRunning);
  const stage = useAuiState((state) => {
    const last = state.thread.messages[state.thread.messages.length - 1];
    const value = last?.metadata.custom[STAGE_KEY];
    return typeof value === "string" ? value : "working";
  });
  const writing = useAuiState((state) => {
    const last = state.thread.messages[state.thread.messages.length - 1];
    return (
      last?.role === "assistant" &&
      last.content.some((part) => part.type === "text" && part.text.length > 0)
    );
  });
  return running && !writing ? (
    <p className="muted" role="status">
      {STAGE_LABELS[stage] ?? STAGE_LABELS.working}
    </p>
  ) : null;
}

/** One conversation bound to a team. */
export function AssistantThread({ scope }: { scope: ChatScope }) {
  const api = useApiClient();
  const adapter = useMemo(
    () => createChatAdapter(api, scope),
    [api, scope.teamId], // eslint-disable-line react-hooks/exhaustive-deps -- scope is keyed by its ids
  );
  const runtime = useLocalRuntime(adapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="chat-thread">
        <ThreadPrimitive.Viewport className="chat-viewport">
          <ThreadPrimitive.Empty>
            <p className="empty">
              Ask about contracts, amendments, listing sheets or market reports.
              Answers cite the document and page.
            </p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>
            {() => <ChatMessage />}
          </ThreadPrimitive.Messages>
          <RunningNotice />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="chat-composer">
          <ComposerPrimitive.Input
            className="chat-input"
            placeholder="Ask a question…"
            aria-label="Your question"
            rows={2}
          />
          <ComposerPrimitive.Send asChild>
            <Button type="submit">Send</Button>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
