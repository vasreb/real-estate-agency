import type { ReactNode } from "react";

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

/**
 * Splits model output into paragraphs, headings and lists. Only the small
 * subset of Markdown the assistant uses is understood; everything else stays
 * plain text, so unknown syntax can never become markup.
 */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1] ?? "" });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = item[2] !== undefined;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.ordered === ordered)
        last.items.push(item[3] ?? "");
      else blocks.push({ kind: "list", ordered, items: [item[3] ?? ""] });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

/** Bold and code spans; other text, including [1] markers, is kept as is. */
function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/** The assistant's answer as readable text, without raw Markdown marks. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="chat-text">
      {parseBlocks(text).map((block, index) => {
        if (block.kind === "heading")
          return (
            <p key={index}>
              <strong>{inline(block.text)}</strong>
            </p>
          );
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
