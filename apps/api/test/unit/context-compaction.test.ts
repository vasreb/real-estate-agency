import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { dropOldSearchResults } from "../../src/modules/assistant/application/assistant-service.js";

const searchResult = (label: string) => ({
  type: "search_result" as const,
  source: `chunk:${label}`,
  title: label,
  content: [{ type: "text" as const, text: `text of ${label}` }],
  citations: { enabled: true },
});
const toolResult = (id: string, label: string): MessageParam => ({
  role: "user",
  content: [
    { type: "tool_result", tool_use_id: id, content: [searchResult(label)] },
  ],
});

describe("dropOldSearchResults", () => {
  it("keeps only the newest search result in full", () => {
    const messages: MessageParam[] = [
      { role: "user", content: "question" },
      toolResult("t1", "first"),
      toolResult("t2", "second"),
      toolResult("t3", "third"),
    ];
    dropOldSearchResults(messages);
    const sources = messages.map((message) =>
      JSON.stringify(message.content).includes("omitted:earlier-search")
        ? "omitted"
        : JSON.stringify(message.content).includes("chunk:")
          ? "full"
          : "plain",
    );
    expect(sources).toEqual(["plain", "omitted", "omitted", "full"]);
    expect(JSON.stringify(messages[3])).toContain("text of third");
    expect(JSON.stringify(messages[1])).not.toContain("text of first");
  });

  it("leaves a single result, plain text and tool errors alone", () => {
    const only: MessageParam[] = [toolResult("t1", "only")];
    const before = JSON.stringify(only);
    dropOldSearchResults(only);
    expect(JSON.stringify(only)).toBe(before);

    const mixed: MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "e1",
            content: [{ type: "text", text: "Property not found" }],
            is_error: true,
          },
        ],
      },
      toolResult("t1", "a"),
      toolResult("t2", "b"),
    ];
    dropOldSearchResults(mixed);
    expect(JSON.stringify(mixed[0])).toContain("Property not found");
    expect(JSON.stringify(mixed[1])).toContain("omitted:earlier-search");
    expect(JSON.stringify(mixed[2])).toContain("text of b");
  });
});
