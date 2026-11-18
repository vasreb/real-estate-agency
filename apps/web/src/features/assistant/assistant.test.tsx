import type { ChatResponse, ChatStreamEvent } from "@agency/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@/shared/api";
import { fakeApi, renderWithProviders } from "@/shared/lib/testing";
import { AssistantChat } from "./chat";
import { readEvents } from "./stream";
import { answerText, shortQuote, toChatRequest, type ChatTurn } from "./model";
import { parseBlocks, RichText } from "./rich-text";

const north = "10000000-0000-4000-8000-000000000001";
const south = "10000000-0000-4000-8000-000000000002";
const dealNorth = "50000000-0000-4000-8000-000000000001";
const document = "60000000-0000-4000-8000-000000000001";

const teams = {
  items: [
    { id: north, name: "Team North", role: "admin" as const },
    { id: south, name: "Team South", role: "member" as const },
  ],
};
const response: ChatResponse = {
  answer: [
    { text: "The rent is 1350 EUR from 2026-03-01.", citations: [1] },
    { text: " The deposit is 2400 EUR.", citations: [] },
  ],
  citations: [
    {
      id: 1,
      document_id: document,
      title: "Amendment 1",
      page_start: 3,
      page_end: 3,
      quote: "the monthly rent is 1350 EUR",
      preview_url: `/api/documents/${document}/preview`,
    },
  ],
  state: { deal_ids: [dealNorth], document_ids: [document] },
  usage: {
    model: "claude-test",
    model_calls: 2,
    input_tokens: 10,
    output_tokens: 5,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    latency_ms: 10,
    stopped_by_budget: false,
  },
};

/** A response body that delivers the given events, one chunk each. */
function streamOf(events: ChatStreamEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events)
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  });
}

/** A stream the test feeds by hand, to look at the page between events. */
function openStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    send: (event: ChatStreamEvent) =>
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    close: () => controller.close(),
  };
}

describe("chat request model", () => {
  const empty = { deal_ids: [], document_ids: [] };

  it("sends the last user turn as the message and earlier text as history", () => {
    expect(
      toChatRequest({
        teamId: north,
        state: empty,
        turns: [
          { role: "user", text: "first" },
          { role: "assistant", text: "answer" },
          { role: "user", text: "  second  " },
        ],
      }),
    ).toEqual({
      team_id: north,
      message: "second",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "answer" },
      ],
      state: empty,
    });
  });

  it("refuses a conversation without a question and never sends a deal", () => {
    expect(
      toChatRequest({
        teamId: north,
        state: empty,
        turns: [{ role: "user", text: "q" }],
      }),
    ).not.toHaveProperty("deal_id");
    expect(
      toChatRequest({
        teamId: north,
        state: empty,
        turns: [{ role: "assistant", text: "hello" }],
      }),
    ).toBeNull();
  });

  it("keeps at most 20 turns and starts the history with a user turn", () => {
    const turns = Array.from<unknown, ChatTurn>({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `t${i}`,
    }));
    turns.push({ role: "user", text: "now" });
    const request = toChatRequest({ teamId: north, state: empty, turns })!;
    expect((request.history ?? []).length).toBeLessThanOrEqual(20);
    expect(request.history?.[0]?.role).toBe("user");
  });

  it("marks the supported parts with citation numbers", () => {
    expect(answerText(response)).toBe(
      "The rent is 1350 EUR from 2026-03-01. [1] The deposit is 2400 EUR.",
    );
  });
});

describe("answer formatting", () => {
  it("understands paragraphs, headings and both kinds of lists", () => {
    expect(
      parseBlocks(
        [
          "# Title",
          "First line",
          "second line",
          "",
          "- one",
          "- two",
          "",
          "1. a",
          "2. b",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "heading", text: "Title" },
      { kind: "paragraph", text: "First line second line" },
      { kind: "list", ordered: false, items: ["one", "two"] },
      { kind: "list", ordered: true, items: ["a", "b"] },
    ]);
  });

  it("shows bold and code without the marks and never turns text into markup", () => {
    const { container } = render(
      <RichText text={"The rent is **GBP1,960.00** [1] <b>x</b> `code`"} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("GBP1,960.00");
    expect(container.querySelector("code")?.textContent).toBe("code");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).toContain("[1] <b>x</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("shortens a long quote on a word-safe boundary", () => {
    expect(shortQuote("a   b\n c")).toBe("a b c");
    const long = shortQuote("word ".repeat(100), 20);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(21);
  });
});

describe("answer stream reader", () => {
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const all: ChatStreamEvent[] = [];
    for await (const event of readEvents(stream)) all.push(event);
    return all;
  };

  it("joins events split across chunks and ignores blank lines", async () => {
    const encoder = new TextEncoder();
    const line = JSON.stringify({ type: "delta", text: "héllo" });
    const bytes = encoder.encode(`${line}\n\n{"type":"reset"}`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split inside a multi-byte character and inside the last line.
        controller.enqueue(bytes.slice(0, 20));
        controller.enqueue(bytes.slice(20, bytes.length - 3));
        controller.enqueue(bytes.slice(bytes.length - 3));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual([
      { type: "delta", text: "héllo" },
      { type: "reset" },
    ]);
  });

  it("refuses a line that is not a known event", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"surprise"}\n'));
        controller.close();
      },
    });
    await expect(collect(stream)).rejects.toThrow();
  });
});

describe("AssistantChat", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup(extra: Parameters<typeof fakeApi>[0] = {}) {
    const chat = vi.fn<ApiClient["chatStream"]>(() =>
      Promise.resolve(
        streamOf([
          { type: "status", stage: "working" },
          { type: "delta", text: "The rent is 1350" },
          { type: "final", response },
        ]),
      ),
    );
    const api = fakeApi({
      listTeams: vi.fn(() => Promise.resolve(teams)),
      chatStream: chat,
      ...extra,
    });
    renderWithProviders(<AssistantChat />, api);
    return { chat, api };
  }

  async function ask(text: string) {
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "Your question" }),
      text,
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
  }

  it("offers the teams only: there is no deal selector", async () => {
    setup();
    const team = await screen.findByLabelText("Team");
    expect(team).toHaveValue(north);
    expect(
      within(team)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Team North", "Team South"]);
    expect(screen.queryByLabelText("Deal")).not.toBeInTheDocument();
  });

  it("sends the question for the selected team and shows the answer with a clickable source", async () => {
    const { chat } = setup();
    await ask("What is the rent?");
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
    expect(chat.mock.calls[0]?.[0]).toEqual({
      team_id: north,
      message: "What is the rent?",
      history: [],
      state: { deal_ids: [], document_ids: [] },
    });
    expect(await screen.findByText(/The rent is 1350 EUR/)).toBeInTheDocument();
    const link = await screen.findByRole("link", {
      name: /\[1\] Amendment 1, p\. 3/,
    });
    expect(link).toHaveAttribute(
      "href",
      `/api/documents/${document}/preview#page=3`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(
      screen.getByText("the monthly rent is 1350 EUR"),
    ).toBeInTheDocument();
    // The list of sources is collapsed behind a summary with the count.
    const summary = screen.getByText(/^Sources \(1\)$/);
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("echoes the surfaced IDs and the earlier text with the next question", async () => {
    const { chat } = setup();
    await ask("First question");
    await screen.findByText(/The rent is 1350 EUR/);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "And the deposit?",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
    const second = chat.mock.calls[1]![0];
    expect(second.message).toBe("And the deposit?");
    expect((second.history ?? []).map((turn) => turn.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(second.history?.[1]?.content).toContain("The rent is 1350 EUR");
    expect(second.state).toEqual({
      deal_ids: [dealNorth],
      document_ids: [document],
    });
  });

  it("starts a new conversation when the team changes", async () => {
    const { chat } = setup();
    await ask("Question in North");
    await screen.findByText(/The rent is 1350 EUR/);
    await userEvent.setup().selectOptions(screen.getByLabelText("Team"), south);
    expect(screen.queryByText(/The rent is 1350 EUR/)).not.toBeInTheDocument();
    await ask("Question in South");
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
    expect(chat.mock.calls[1]?.[0]).toMatchObject({
      team_id: south,
      history: [],
    });
  });

  it("shows a readable error instead of the server text", async () => {
    setup({
      chatStream: vi.fn<ApiClient["chatStream"]>(() =>
        Promise.reject(new ApiError(503, "ASSISTANT_UNAVAILABLE")),
      ),
    });
    await ask("Anything");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Internal server error. Please try again later.",
    );
  });

  it("shows the text while it is written, then replaces it with the checked answer", async () => {
    const feed = openStream();
    setup({
      chatStream: vi.fn<ApiClient["chatStream"]>(() =>
        Promise.resolve(feed.stream),
      ),
    });
    await ask("What is the rent?");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Checking the documents…",
    );

    feed.send({ type: "status", stage: "searching" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Searching the documents…",
    );

    feed.send({ type: "delta", text: "The rent is " });
    feed.send({ type: "delta", text: "**1350** EUR" });
    // Partial text is visible before the answer is complete, without marks.
    expect(await screen.findByText(/1350/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();

    feed.send({ type: "final", response });
    feed.close();
    expect(await screen.findByText(/Sources \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/The rent is 1350 EUR/)).toBeInTheDocument();
  });

  it("drops provisional text when the server resets it", async () => {
    const feed = openStream();
    setup({
      chatStream: vi.fn<ApiClient["chatStream"]>(() =>
        Promise.resolve(feed.stream),
      ),
    });
    await ask("What is the rent?");
    feed.send({ type: "delta", text: "Let me look that up." });
    expect(await screen.findByText("Let me look that up.")).toBeInTheDocument();
    feed.send({ type: "reset" });
    await waitFor(() =>
      expect(
        screen.queryByText("Let me look that up."),
      ).not.toBeInTheDocument(),
    );
    feed.send({ type: "final", response });
    feed.close();
    expect(await screen.findByText(/The rent is 1350 EUR/)).toBeInTheDocument();
  });

  it("shows an error event as a readable alert", async () => {
    setup({
      chatStream: vi.fn<ApiClient["chatStream"]>(() =>
        Promise.resolve(
          streamOf([
            { type: "delta", text: "Partial" },
            {
              type: "error",
              code: "ASSISTANT_UNAVAILABLE",
              message: "The assistant could not answer. Please try again.",
            },
          ]),
        ),
      ),
    });
    await ask("Anything");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant could not answer. Please try again.",
    );
  });

  it("reports a stream that ends without a final answer", async () => {
    setup({
      chatStream: vi.fn<ApiClient["chatStream"]>(() =>
        Promise.resolve(streamOf([{ type: "delta", text: "Half an answ" }])),
      ),
    });
    await ask("Anything");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The answer was interrupted",
    );
  });

  it("explains when the user has no team", async () => {
    renderWithProviders(
      <AssistantChat />,
      fakeApi({
        listTeams: vi.fn(() => Promise.resolve({ items: [] })),
      }),
    );
    expect(
      await screen.findByText("You are not a member of any team."),
    ).toBeInTheDocument();
  });
});
