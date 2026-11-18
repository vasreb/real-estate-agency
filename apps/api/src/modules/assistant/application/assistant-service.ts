import type {
  ChatCitation,
  ChatInput,
  ChatResponse,
  ChatStreamEvent,
  TeamScope,
} from "@agency/contracts";
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  SearchResultBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { HttpError } from "../../../infrastructure/errors.js";
import type { Embedder } from "../../indexing/index.js";
import type { RetrievalRepository } from "../infrastructure/retrieval-repository.js";
import { createDocumentSearch } from "./document-search.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createToolRunner, toolDefinitions, type SourceRef } from "./tools.js";

/** The one call the assistant makes to the model; faked in tests. */
export type LlmClient = {
  /**
   * With `onText` the reply is streamed and every text delta is reported while
   * it is generated; the complete message is still what is returned.
   */
  createMessage(
    params: MessageCreateParamsNonStreaming,
    options?: { onText?: (delta: string) => void; signal?: AbortSignal },
  ): Promise<Message>;
};

export type AssistantOptions = {
  llm: LlmClient;
  model: string;
  repository: RetrievalRepository;
  embedder: Embedder;
  getTeamScope: (userId: string, teamId: string) => Promise<TeamScope | null>;
  maxSteps?: number;
  /** Stop when one request alone carries more input tokens than this. */
  maxInputTokens?: number;
  maxOutputTokens?: number;
  now?: () => Date;
  clock?: () => number;
};

const BUDGET_MESSAGE =
  "I could not finish checking the documents within the allowed number of steps. Please narrow the question, for example by naming the deal or the document.";
const SIZE_MESSAGE =
  "The search returned more text than I can work with in one answer. Please narrow the question, for example by naming the deal or the document.";
const EMPTY_ANSWER_MESSAGE =
  "I could not produce an answer this time. Please ask again or rephrase the question.";
const ANSWER_NOW_PROMPT =
  "Answer the question now in text, using what the searches returned. If they did not contain the answer, say what you could not confirm.";
const TRUNCATED_MESSAGE =
  "The answer above was cut off because it reached the length limit. Ask a narrower question to get the rest.";
const CITE_PROMPT =
  "Repeat your answer and cite the retrieved passages that support each statement. If no passage supports a statement, say so instead of citing.";
const MAX_STATE_IDS = 20;
/** Above this request size, search results of earlier steps are dropped. */
const COMPACT_AFTER_TOKENS = 60_000;

const OMITTED_RESULT: SearchResultBlockParam = {
  type: "search_result",
  source: "omitted:earlier-search",
  title: "Earlier search results removed",
  content: [
    {
      type: "text",
      text: "The text of an earlier search was removed to keep the conversation small. Search again if you need a passage from it.",
    },
  ],
  citations: { enabled: true },
};

/**
 * Keeps only the newest search result in full. Older ones are replaced by a
 * short note, so a question that needed many searches does not hit the size
 * limit; a passage from a removed result can no longer be cited.
 */
export function dropOldSearchResults(messages: MessageParam[]): void {
  const carriesSearch = (message: MessageParam) =>
    message.role === "user" &&
    Array.isArray(message.content) &&
    message.content.some(
      (block) =>
        block.type === "tool_result" &&
        Array.isArray(block.content) &&
        block.content.some((part) => part.type === "search_result"),
    );
  const withSearch = messages.filter(carriesSearch);
  for (const message of withSearch.slice(0, -1))
    if (Array.isArray(message.content))
      message.content = message.content.map((block) =>
        block.type === "tool_result" &&
        Array.isArray(block.content) &&
        block.content.some((part) => part.type === "search_result")
          ? { ...block, content: [OMITTED_RESULT] }
          : block,
      );
}

/** Marks the end of the conversation so the stable prefix is cached. */
function withCacheMarker(messages: MessageParam[]): MessageParam[] {
  const copy = messages.map((message) => ({ ...message }));
  const last = copy[copy.length - 1];
  if (!last) return copy;
  const blocks: ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : [...last.content];
  const tail = blocks[blocks.length - 1];
  if (tail && "type" in tail)
    blocks[blocks.length - 1] = {
      ...tail,
      cache_control: { type: "ephemeral" },
    } as ContentBlockParam;
  last.content = blocks;
  return copy;
}

/** Keeps only the fields the API accepts back from a response. */
function toParams(content: Message["content"]): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = [];
  for (const block of content) {
    if (block.type === "text") blocks.push({ type: "text", text: block.text });
    else if (block.type === "tool_use")
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      });
  }
  return blocks;
}

/** What a streamed answer reports while the model is working. */
type StreamHooks = {
  signal?: AbortSignal | undefined;
  onText?: (delta: string) => void;
  /** The text streamed so far is provisional and must be discarded. */
  onReset?: () => void;
  onSearching?: () => void;
};

/** Hands events from callbacks to an async consumer, in order. */
function eventQueue<T>() {
  const items: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(item: T) {
      if (closed) return;
      items.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      for (;;) {
        while (items.length > 0) yield items.shift() as T;
        if (closed) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    },
  };
}

/** Lets an evaluation run see which passages the model was given. */
export type ChatObserver = { source?: (ref: SourceRef) => void };

export function createAssistant(options: AssistantOptions) {
  const maxSteps = options.maxSteps ?? 20;
  const maxInputTokens = options.maxInputTokens ?? 150_000;
  const maxOutputTokens = options.maxOutputTokens ?? 8192;
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => Date.now());
  const search = createDocumentSearch({
    repository: options.repository,
    embedder: options.embedder,
  });

  /** Scope is verified on the server; a foreign team is a 404. */
  async function verifyScope(userId: string, input: ChatInput) {
    const team = await options.getTeamScope(userId, input.team_id);
    if (!team) throw new HttpError("NOT_FOUND");
  }

  async function execute(
    input: ChatInput,
    observer?: ChatObserver,
    hooks?: StreamHooks,
  ): Promise<ChatResponse> {
    {
      const started = clock();
      // Always the whole team: the model narrows to a deal itself, by number
      // or address, with search_records.
      const scope = { teamId: input.team_id };

      const sources = new Map<string, SourceRef>();
      const dealIds = new Set<string>(input.state.deal_ids);
      const documentIds = new Set<string>(input.state.document_ids);
      const tools = createToolRunner({
        repository: options.repository,
        search,
        scope,
        userMessage: input.message,
        registerSource: (ref) => {
          sources.set(ref.source, ref);
          observer?.source?.(ref);
        },
        noteDeal: (id) => dealIds.add(id),
        noteDocument: (id) => documentIds.add(id),
      });

      const system: TextBlockParam[] = [
        {
          type: "text",
          text: buildSystemPrompt({
            today: now().toISOString().slice(0, 10),
            knownDocumentIds: input.state.document_ids,
          }),
          cache_control: { type: "ephemeral" },
        },
      ];
      const toolList = toolDefinitions.map((tool, index) =>
        index === toolDefinitions.length - 1
          ? { ...tool, cache_control: { type: "ephemeral" as const } }
          : tool,
      );

      // The model API requires the conversation to start with a user turn.
      const firstUser = input.history.findIndex((turn) => turn.role === "user");
      const history = firstUser === -1 ? [] : input.history.slice(firstUser);
      const messages: MessageParam[] = [
        ...history.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: "user" as const, content: input.message },
      ];

      const usage = {
        model_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };
      let final: Message | undefined;
      let stoppedByBudget = false;
      let tooLarge = false;
      let contextTokens = 0;
      let askedToAnswer = false;
      let askedToCite = false;
      let truncated = false;
      let uncited: Message | undefined;

      for (let step = 1; ; step++) {
        if (hooks?.signal?.aborted) throw new Error("Request aborted");
        if (contextTokens > COMPACT_AFTER_TOKENS)
          dropOldSearchResults(messages);
        let streamedThisStep = false;
        const response = await options.llm.createMessage(
          {
            model: options.model,
            max_tokens: maxOutputTokens,
            system,
            tools: toolList,
            messages: withCacheMarker(messages),
          },
          hooks?.onText
            ? {
                signal: hooks.signal,
                onText: (delta) => {
                  streamedThisStep = true;
                  hooks.onText?.(delta);
                },
              }
            : hooks?.signal
              ? { signal: hooks.signal }
              : undefined,
        );
        usage.model_calls += 1;
        usage.input_tokens += response.usage.input_tokens;
        usage.output_tokens += response.usage.output_tokens;
        usage.cache_read_tokens += response.usage.cache_read_input_tokens ?? 0;
        usage.cache_creation_tokens +=
          response.usage.cache_creation_input_tokens ?? 0;
        contextTokens =
          response.usage.input_tokens +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0);

        const calls = response.content.filter(
          (block) => block.type === "tool_use",
        );
        if (response.stop_reason !== "tool_use" || calls.length === 0) {
          final = response;
          // A reply without any text is not an answer: ask once for it.
          const hasText = response.content.some(
            (block) => block.type === "text" && block.text.length > 0,
          );
          if (!hasText && !askedToAnswer && step < maxSteps) {
            askedToAnswer = true;
            final = undefined;
            if (streamedThisStep) hooks?.onReset?.();
            const content = toParams(response.content);
            if (content.length > 0)
              messages.push({ role: "assistant", content });
            messages.push({ role: "user", content: ANSWER_NOW_PROMPT });
            continue;
          }
          // An answer built on retrieved passages should point at them: the
          // model sometimes omits citations, so ask once more.
          const hasCitation = response.content.some(
            (block) =>
              block.type === "text" && (block.citations?.length ?? 0) > 0,
          );
          truncated = response.stop_reason === "max_tokens";
          if (
            hasText &&
            !truncated &&
            !hasCitation &&
            sources.size > 0 &&
            !askedToCite &&
            step < maxSteps
          ) {
            askedToCite = true;
            uncited = response;
            final = undefined;
            if (streamedThisStep) hooks?.onReset?.();
            messages.push({
              role: "assistant",
              content: toParams(response.content),
            });
            messages.push({ role: "user", content: CITE_PROMPT });
            continue;
          }
          // The repeat must not lose the first answer.
          if (uncited && !hasText) final = uncited;
          break;
        }
        const requestSize = contextTokens;
        if (step >= maxSteps || requestSize > maxInputTokens) {
          stoppedByBudget = true;
          tooLarge = step < maxSteps;
          break;
        }

        // Text written before a tool call is a preamble, not the answer.
        if (streamedThisStep) hooks?.onReset?.();
        hooks?.onSearching?.();
        messages.push({
          role: "assistant",
          content: toParams(response.content),
        });
        const results: ToolResultBlockParam[] = [];
        for (const call of calls) {
          const output = await tools.run(call.name, call.input);
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: output.content,
            ...(output.isError ? { is_error: true } : {}),
          });
        }
        messages.push({ role: "user", content: results });
      }

      const citations: ChatCitation[] = [];
      const citationIds = new Map<string, number>();
      const answer: ChatResponse["answer"] = [];
      for (const block of final?.content ?? []) {
        if (block.type !== "text" || block.text.length === 0) continue;
        const numbers: number[] = [];
        for (const citation of block.citations ?? []) {
          if (citation.type !== "search_result_location") continue;
          // Only sources this request actually returned can be cited.
          const ref = sources.get(citation.source);
          if (!ref) continue;
          let id = citationIds.get(citation.source);
          if (id === undefined) {
            id = citations.length + 1;
            citationIds.set(citation.source, id);
            citations.push({
              id,
              document_id: ref.documentId,
              title: ref.title,
              page_start: ref.pageStart,
              page_end: ref.pageEnd,
              quote: citation.cited_text,
              preview_url: `/api/documents/${ref.documentId}/preview`,
            });
          }
          if (!numbers.includes(id)) numbers.push(id);
        }
        answer.push({ text: block.text, citations: numbers });
      }
      if (stoppedByBudget)
        answer.push({
          text: tooLarge ? SIZE_MESSAGE : BUDGET_MESSAGE,
          citations: [],
        });
      else if (truncated && answer.length > 0)
        answer.push({ text: TRUNCATED_MESSAGE, citations: [] });
      else if (answer.length === 0)
        answer.push({ text: EMPTY_ANSWER_MESSAGE, citations: [] });

      return {
        answer,
        citations,
        state: {
          deal_ids: [...dealIds].slice(-MAX_STATE_IDS),
          document_ids: [...documentIds].slice(-MAX_STATE_IDS),
        },
        usage: {
          model: options.model,
          ...usage,
          latency_ms: Math.max(0, clock() - started),
          stopped_by_budget: stoppedByBudget,
        },
      };
    }
  }

  return {
    async chat(
      userId: string,
      input: ChatInput,
      observer?: ChatObserver,
    ): Promise<ChatResponse> {
      await verifyScope(userId, input);
      return execute(input, observer);
    },

    /**
     * The same answer as `chat`, reported as events while it is produced.
     * Access is checked before this returns, so a refusal is still an HTTP
     * error; failures after that arrive as an `error` event.
     */
    async chatStream(
      userId: string,
      input: ChatInput,
      options: {
        signal?: AbortSignal;
        onError?: (error: unknown) => void;
      } = {},
    ): Promise<AsyncIterable<ChatStreamEvent>> {
      await verifyScope(userId, input);
      const queue = eventQueue<ChatStreamEvent>();
      void execute(input, undefined, {
        signal: options.signal,
        onText: (text) => queue.push({ type: "delta", text }),
        onReset: () => queue.push({ type: "reset" }),
        onSearching: () => queue.push({ type: "status", stage: "searching" }),
      }).then(
        (response) => {
          queue.push({ type: "final", response });
          queue.close();
        },
        (error: unknown) => {
          options.onError?.(error);
          queue.push({
            type: "error",
            code:
              error instanceof HttpError ? error.code : "ASSISTANT_UNAVAILABLE",
            message: "The assistant could not answer. Please try again.",
          });
          queue.close();
        },
      );
      return queue;
    },
  };
}
export type Assistant = ReturnType<typeof createAssistant>;
