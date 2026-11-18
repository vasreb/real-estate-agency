import {
  chatResponseSchema,
  chatStreamEventSchema,
  type ChatInput,
  type ChatStreamEvent,
} from "@agency/contracts";
import { createApp } from "../../src/app.js";
import { createAssistant } from "../../src/modules/assistant/index.js";
import { namePhrases } from "../../src/modules/assistant/application/document-search.js";
import { createRetrievalRepository } from "../../src/modules/assistant/infrastructure/retrieval-repository.js";
import { chunkPages } from "../../src/modules/indexing/domain/chunking.js";
import { createJobStore } from "../../src/modules/indexing/infrastructure/job-store.js";
import { createTeamQueries } from "../../src/modules/teams/index.js";
import {
  fakeEmbedder,
  fakeVector,
  finalText,
  lastToolResult,
  scriptedModel,
  toolUse,
  type ModelStep,
} from "../fixtures/assistant.js";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import {
  accounts,
  login,
  openDatabase,
  ORIGIN,
  testConfig,
} from "./helpers.js";

const db = openDatabase();
const store = createJobStore(db);
const repository = createRetrievalRepository(db);
const teams = createTeamQueries({ database: db });
const created: string[] = [];
let pdf: Uint8Array<ArrayBuffer>;

function assistantWith(
  steps: ModelStep[],
  options: { maxSteps?: number; maxInputTokens?: number } = {},
) {
  const model = scriptedModel(steps);
  const assistant = createAssistant({
    llm: model.llm,
    model: "claude-test",
    repository,
    embedder: fakeEmbedder,
    getTeamScope: (userId, teamId) =>
      teams.getAccessibleTeamScope(userId, teamId),
    now: () => new Date("2026-06-01T00:00:00Z"),
    ...options,
  });
  return { assistant, requests: model.requests, calls: model.calls };
}

async function indexText(documentId: string, text: string) {
  const chunks = chunkPages([{ page: 1, text }]).map((chunk) => ({
    ...chunk,
    embedding: fakeVector(chunk.content),
  }));
  await store.indexingStore.replaceChunks({
    documentId,
    model: "fake-embedder",
    chunks,
    pdfRepresentation: null,
  });
}

async function newDocument(data: {
  dealId: string;
  type: "contract" | "amendment" | "other";
  title: string;
  parentDocumentId?: string;
  documentNumber?: string;
  effectiveFrom?: string;
  status?: "draft" | "signed" | "unknown";
}) {
  const document = await db.document.create({
    data: {
      dealId: data.dealId,
      type: data.type,
      title: data.title,
      parentDocumentId: data.parentDocumentId ?? null,
      documentNumber: data.documentNumber ?? null,
      effectiveFrom: data.effectiveFrom
        ? new Date(`${data.effectiveFrom}T00:00:00Z`)
        : null,
      status: data.status ?? "unknown",
      fileName: "x.pdf",
      mimeType: PDF_MIME,
      fileData: pdf,
    },
    select: { id: true },
  });
  created.push(document.id);
  return document.id;
}

const ask = (overrides: Partial<ChatInput> = {}): ChatInput => ({
  team_id: ids.teamNorth,
  message: "What is the monthly rent?",
  history: [],
  state: { deal_ids: [], document_ids: [] },
  ...overrides,
});

beforeAll(async () => {
  pdf = await createSamplePdf("assistant tests");
  await indexText(
    ids.docNorthContract,
    "1. Rent\nThe monthly rent is 1200 EUR payable in advance.\n2. Deposit\nThe security deposit is 2400 EUR.",
  );
  await indexText(
    ids.docNorthAmendment,
    "Amendment 1\nClause 1 is changed: the monthly rent is 1350 EUR from 2026-03-01.",
  );
  await indexText(
    ids.docSouthContract,
    "1. Rent\nThe monthly rent is 9999 EUR. South confidential clause about the tenant Borealis.",
  );
});
afterAll(async () => {
  await db.document.deleteMany({
    where: { id: { in: created }, parentDocumentId: { not: null } },
  });
  await db.document.deleteMany({ where: { id: { in: created } } });
  await db.documentChunk.deleteMany({
    where: {
      documentId: {
        in: [ids.docNorthContract, ids.docNorthAmendment, ids.docSouthContract],
      },
    },
  });
  await db.$disconnect();
});

describe("search_records", () => {
  it("finds a deal by number only inside the selected team", async () => {
    // Both teams have a deal numbered 2026-001 (seed data).
    const { assistant, requests } = assistantWith([
      toolUse("search_records", { query: "commission for deal 2026-001" }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userMulti, ask({ message: "deal 2026-001" }));
    const result = lastToolResult(requests[1]!);
    const parsed = JSON.parse(result.text[0]!) as {
      matches: { deal_id: string; deal_number: string; matched_by: string }[];
    };
    expect(parsed.matches.map((match) => match.deal_id)).toEqual([
      ids.dealNorthSale,
    ]);
    expect(parsed.matches[0]).toMatchObject({
      deal_number: "2026-001",
      matched_by: "deal_number",
    });
  });

  it("returns an explicit hint when nothing matches", async () => {
    const { assistant, requests } = assistantWith([
      toolUse("search_records", { query: "nonexistent 12345" }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask());
    const parsed = JSON.parse(lastToolResult(requests[1]!).text[0]!) as {
      matches: unknown[];
      note: string;
    };
    expect(parsed.matches).toEqual([]);
    expect(parsed.note).toContain("Ask for");
  });
});

describe("get_property", () => {
  it("returns the address and deals, and hides properties of other teams", async () => {
    const own = assistantWith([
      toolUse("get_property", { property_id: ids.propertyCentral }),
      finalText("ok"),
    ]);
    await own.assistant.chat(ids.userAdmin, ask());
    const parsed = JSON.parse(lastToolResult(own.requests[1]!).text[0]!) as {
      address: string;
      deals: { deal_id: string }[];
    };
    expect(parsed.address.length).toBeGreaterThan(0);
    expect(parsed.deals.length).toBeGreaterThan(0);

    const foreign = assistantWith([
      toolUse("get_property", { property_id: ids.propertyCentral }),
      finalText("ok"),
    ]);
    // Team South has no deal on this property.
    await foreign.assistant.chat(
      ids.userOther,
      ask({ team_id: ids.teamSouth }),
    );
    const hidden = lastToolResult(foreign.requests[1]!);
    expect(hidden.isError).toBe(true);
  });
});

describe("context size", () => {
  it("brings the text of only the closest amendments and lists the rest with an extract", async () => {
    const contract = await newDocument({
      dealId: ids.dealNorthRental,
      type: "contract",
      title: "Contract with many amendments",
      documentNumber: "MANY-1",
    });
    await indexText(
      contract,
      "1. Fees\nThe quokka agency fee is five percent.",
    );
    const amendmentIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const amendment = await newDocument({
        dealId: ids.dealNorthRental,
        type: "amendment",
        title: `Many amendment ${i}`,
        parentDocumentId: contract,
        status: "signed",
        effectiveFrom: "2026-01-01",
      });
      await indexText(
        amendment,
        `1. Change ${i}\nThe quokka agency fee changes to ${i + 1} percent. ${"Clause text. ".repeat(40)}`,
      );
      amendmentIds.push(amendment);
    }
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", { query: "quokka agency fee percent" }),
      finalText("ok"),
    ]);
    await assistant.chat(
      ids.userAdmin,
      ask({ message: "What is the quokka agency fee percent?" }),
    );
    const overview = JSON.parse(lastToolResult(requests[1]!).text[0]!) as {
      amendments: {
        document_id: string;
        sources: string[];
        text_not_included?: boolean;
        extract?: string;
      }[];
      gaps: string[];
    };
    const mine = overview.amendments.filter((a) =>
      amendmentIds.includes(a.document_id),
    );
    // Every amendment is listed with its status, but few bring their text.
    expect(mine).toHaveLength(6);
    expect(
      overview.amendments.filter((a) => a.sources.length > 0).length,
    ).toBeLessThanOrEqual(4);
    const brief = mine.filter((a) => a.text_not_included);
    expect(brief.length).toBeGreaterThanOrEqual(2);
    for (const entry of brief) {
      expect(entry.sources).toEqual([]);
      expect(entry.extract?.length).toBeGreaterThan(20);
    }
    expect(overview.gaps.join(" ")).toContain("less relevant amendments");
    // Each amendment shows at most two passages.
    for (const entry of overview.amendments)
      expect(entry.sources.length).toBeLessThanOrEqual(2);
  });

  it("drops earlier search results once the request has grown large", async () => {
    const huge =
      (text: string): ModelStep =>
      () => ({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: `t-${text}`,
            name: "search_documents",
            input: { query: "monthly rent" },
          },
        ] as never,
        input: 70_000,
      });
    const { assistant, requests } = assistantWith([
      huge("one"),
      huge("two"),
      finalText("done"),
    ]);
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(response.usage.stopped_by_budget).toBe(false);
    // An uncited final answer may be asked once more for citations.
    expect(requests.length).toBeGreaterThanOrEqual(3);
    const results = (request: (typeof requests)[number]) =>
      request.messages
        .filter(
          (m) =>
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_result"),
        )
        .map((m) => JSON.stringify(m.content));
    // Third request: the first search result is a note, the newest is whole.
    const third = results(requests[2]!);
    expect(third).toHaveLength(2);
    expect(third[0]).toContain("omitted:earlier-search");
    expect(third[0]).not.toContain("monthly rent is");
    expect(third[1]).toContain("chunk:");
    // The second request still had a single result, which stays whole.
    expect(results(requests[1]!)[0]).toContain("chunk:");
  });
});

describe("finding the amendment that rewrites a clause", () => {
  type Overview = {
    amendments: {
      document_id: string;
      sources: string[];
      matched_by: string[];
      text_not_included?: boolean;
    }[];
  };

  const created: string[] = [];
  afterEach(async () => {
    await db.document.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  });

  async function setup(target: string, strong: number, weak: number) {
    const contract = await newDocument({
      dealId: ids.dealNorthRental,
      type: "contract",
      title: "Contract with a notice clause",
      documentNumber: "NOTICE-1",
    });
    created.push(contract);
    await indexText(
      contract,
      "1. Parties\nThe landlord and the tenant.\n\n4.2 Termination notice\nEither party ends the tenancy by giving two months of written warning to the other.",
    );
    const targetId = await newDocument({
      dealId: ids.dealNorthRental,
      type: "amendment",
      title: "Amendment that changes the notice",
      parentDocumentId: contract,
      status: "signed",
      effectiveFrom: "2026-02-01",
    });
    created.push(targetId);
    await indexText(targetId, target);
    // Amendments that repeat the words of the question but are not about the
    // clause (strong), and unrelated ones (weak).
    for (let i = 0; i < strong + weak; i++) {
      const other = await newDocument({
        dealId: ids.dealNorthRental,
        type: "amendment",
        title: `Notice period note ${i}`,
        parentDocumentId: contract,
        status: "signed",
        effectiveFrom: `2026-03-0${i + 1}`,
      });
      created.push(other);
      await indexText(
        other,
        i < strong
          ? `1. Reminder ${i}\ntermination notice period tenancy warning ${"termination notice period tenancy warning. ".repeat(6)}`
          : `1. Garden ${i}\nThe garden gate is painted green and the shed key hangs by the door.`,
      );
    }
    return targetId;
  }

  async function overviewFor(query: string) {
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", { query }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask({ message: query }));
    return JSON.parse(lastToolResult(requests[1]!).text[0]!) as Overview;
  }

  it("brings an amendment that cites the clause number of the contract", async () => {
    const targetId = await setup(
      "1. Change\nClause 4.2 of the base agreement is replaced. The period becomes three months.",
      7,
      0,
    );
    const overview = await overviewFor(
      "termination notice period tenancy warning",
    );
    const target = overview.amendments.find((a) => a.document_id === targetId);
    expect(target?.text_not_included).toBeUndefined();
    expect(target?.sources.length).toBeGreaterThan(0);
    expect(target?.matched_by).toContain("clause_number");
  });

  it("brings an amendment whose text is close to the contract clause", async () => {
    const targetId = await setup(
      "1. Change\nEither party ends the tenancy by giving three months of written warning to the other.",
      3,
      4,
    );
    const overview = await overviewFor(
      "termination notice period tenancy warning",
    );
    const target = overview.amendments.find((a) => a.document_id === targetId);
    expect(target?.text_not_included).toBeUndefined();
    expect(target?.sources.length).toBeGreaterThan(0);
    expect(target?.matched_by).toContain("contract_clause");
  });
});

describe("person names in questions", () => {
  it("finds the exact names written in a question", () => {
    expect(
      namePhrases("Who pays for broadband for Leila Ivydale at the flat?"),
    ).toEqual(["Leila Ivydale"]);
    expect(namePhrases("who pays for broadband")).toEqual([]);
    expect(namePhrases("Leila   Ivydale and Theo Marsh Webb")).toEqual([
      "Leila Ivydale",
      "Theo Marsh Webb",
    ]);
  });

  it("finds a tenant by name even when many other passages match the topic", async () => {
    const tenancy = await newDocument({
      dealId: ids.dealNorthRental,
      type: "contract",
      title: "Tenancy for the name test",
    });
    await indexText(
      tenancy,
      "1. Parties\nZyx Qwertyuiop is the proposed or actual tenant of the flat.\n2. Utilities\nBroadband is arranged by the tenant.",
    );
    // Many passages about the same topic, none naming the tenant.
    for (let i = 0; i < 12; i++) {
      const other = await newDocument({
        dealId: ids.dealNorthSale,
        type: "other",
        title: `Broadband note ${i}`,
      });
      await indexText(
        other,
        `Broadband owner pays tenant landlord cost amendment note ${i}.`,
      );
    }
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", {
        query: "who pays broadband owner tenant Zyx Qwertyuiop",
      }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask());
    const result = lastToolResult(requests[1]!);
    const chunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: tenancy, content: { contains: "Zyx Qwertyuiop" } },
      select: { id: true },
    });
    expect(result.sources).toContain(`chunk:${chunk.id}`);
  });
});

describe("search_documents", () => {
  it("returns cited passages and every linked amendment even when it ranks low", async () => {
    const { assistant, requests } = assistantWith([
      // The amendment text does not mention a deposit.
      toolUse("search_documents", { query: "security deposit amount" }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask({ message: "deposit?" }));
    const result = lastToolResult(requests[1]!);
    const overview = JSON.parse(result.text[0]!) as {
      amendments: {
        document_id: string;
        link: string;
        signing_status: string;
        effective_from: string | null;
      }[];
    };
    expect(overview.amendments.map((a) => a.document_id)).toContain(
      ids.docNorthAmendment,
    );
    expect(
      overview.amendments.find((a) => a.document_id === ids.docNorthAmendment),
    ).toMatchObject({ link: "confirmed" });
    const amendmentChunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: ids.docNorthAmendment },
      select: { id: true },
    });
    expect(result.sources).toContain(`chunk:${amendmentChunk.id}`);
  });

  it("never returns passages of another team", async () => {
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", {
        query: "South confidential Borealis 9999",
      }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask());
    const result = lastToolResult(requests[1]!);
    const southChunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: ids.docSouthContract },
      select: { id: true },
    });
    expect(result.sources).not.toContain(`chunk:${southChunk.id}`);
    expect(JSON.stringify(result)).not.toContain("Borealis");

    // The same question in the South team does find it.
    const south = assistantWith([
      toolUse("search_documents", {
        query: "South confidential Borealis 9999",
      }),
      finalText("ok"),
    ]);
    await south.assistant.chat(ids.userOther, ask({ team_id: ids.teamSouth }));
    expect(lastToolResult(south.requests[1]!).sources).toContain(
      `chunk:${southChunk.id}`,
    );
  });

  it("never narrows to a deal of another team, even when the message names its number", async () => {
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", {
        query: "monthly rent",
        filters: { deal_id: ids.dealSouthSale },
      }),
      finalText("ok"),
    ]);
    // Both teams have a deal 2026-001; only the selected team's one counts.
    await assistant.chat(
      ids.userAdmin,
      ask({ message: "For deal 2026-001: what is the monthly rent?" }),
    );
    const result = lastToolResult(requests[1]!);
    expect(result.sources).toHaveLength(0);
    expect(result.isError).toBe(true);
  });

  it("searches the whole team unless the current question names the deal", async () => {
    const vague = assistantWith([
      toolUse("search_documents", {
        query: "monthly rent",
        filters: { deal_id: ids.dealNorthSale },
      }),
      finalText("ok"),
    ]);
    // The deal was discussed earlier (history and state), but not named now.
    await vague.assistant.chat(
      ids.userAdmin,
      ask({
        message: "What is the monthly rent?",
        history: [
          { role: "user", content: "For deal 2026-001: who is the tenant?" },
          { role: "assistant", content: "The tenant is Acme." },
        ],
        state: { deal_ids: [ids.dealNorthSale], document_ids: [] },
      }),
    );
    const refused = lastToolResult(vague.requests[1]!);
    expect(refused.isError).toBe(true);
    expect(refused.text[0]).toContain("does not name that deal");

    const named = assistantWith([
      toolUse("search_documents", {
        query: "monthly rent",
        filters: { deal_id: ids.dealNorthSale },
      }),
      finalText("ok"),
    ]);
    await named.assistant.chat(
      ids.userAdmin,
      ask({ message: "For deal 2026-001: what is the monthly rent?" }),
    );
    const accepted = lastToolResult(named.requests[1]!);
    expect(accepted.isError).toBeFalsy();
    expect(accepted.sources.length).toBeGreaterThan(0);
  });

  it("flags unlinked amendments as possible and reports unindexed ones as gaps", async () => {
    const contract = await newDocument({
      dealId: ids.dealNorthRental,
      type: "contract",
      title: "Rental contract RC-77",
      documentNumber: "RC-77",
    });
    await indexText(
      contract,
      "1. Rent\nTenant pays 800 EUR per month. Contract RC-77.",
    );
    const naming = await newDocument({
      dealId: ids.dealNorthRental,
      type: "amendment",
      title: "Unlinked amendment naming the contract",
      effectiveFrom: "2026-02-01",
    });
    await indexText(
      naming,
      "Amendment to contract RC-77: rent becomes 850 EUR.",
    );
    const unrelated = await newDocument({
      dealId: ids.dealNorthRental,
      type: "amendment",
      title: "Unlinked amendment about something else",
    });
    await indexText(
      unrelated,
      "Amendment to contract ZZ-1: parking space added.",
    );
    const notIndexed = await newDocument({
      dealId: ids.dealNorthRental,
      type: "amendment",
      title: "Linked but unprocessed amendment",
      parentDocumentId: contract,
    });

    const { assistant, requests } = assistantWith([
      toolUse("search_documents", {
        query: "tenant pays per month",
        filters: { deal_id: ids.dealNorthRental },
      }),
      finalText("ok"),
    ]);
    await assistant.chat(
      ids.userAdmin,
      ask({
        message: "For deal 2026-002: what does the tenant pay per month?",
      }),
    );
    const overview = JSON.parse(lastToolResult(requests[1]!).text[0]!) as {
      amendments: { document_id: string; link: string; link_reason?: string }[];
      gaps: string[];
    };
    const byId = Object.fromEntries(
      overview.amendments.map((amendment) => [
        amendment.document_id,
        amendment,
      ]),
    );
    expect(byId[naming]).toMatchObject({ link: "possible" });
    expect(byId[naming]?.link_reason).toContain("RC-77");
    expect(byId[unrelated]).toBeUndefined();
    expect(byId[notIndexed]).toMatchObject({ link: "confirmed" });
    expect(overview.gaps.join(" ")).toContain("is not indexed");
  });

  it("searches inside a long amendment instead of passing it whole", async () => {
    const contract = await newDocument({
      dealId: ids.dealNorthRental,
      type: "contract",
      title: "Contract with a long amendment",
    });
    await indexText(
      contract,
      "1. Fee\nThe agency fee is 5 percent. Long amendment test.",
    );
    const long = await newDocument({
      dealId: ids.dealNorthRental,
      type: "amendment",
      title: "Long amendment",
      parentDocumentId: contract,
    });
    const filler = Array.from(
      { length: 40 },
      (_, i) =>
        `${i + 2}. Misc clause ${i}\nGeneral provisions about cleaning and notices ${"text ".repeat(25)}`,
    ).join("\n");
    await indexText(
      long,
      `1. Fee\nThe agency fee is changed to 7 percent from 2026-04-01.\n${filler}`,
    );
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", {
        query: "agency fee percent",
        filters: { deal_id: ids.dealNorthRental },
      }),
      finalText("ok"),
    ]);
    await assistant.chat(
      ids.userAdmin,
      ask({ message: "For deal 2026-002: what is the agency fee percent?" }),
    );
    const result = lastToolResult(requests[1]!);
    const overview = JSON.parse(result.text[0]!) as {
      amendments: { document_id: string; sources: string[] }[];
    };
    const entry = overview.amendments.find((a) => a.document_id === long)!;
    expect(entry.sources.length).toBeLessThanOrEqual(3);
    const total = await db.documentChunk.count({ where: { documentId: long } });
    expect(total).toBeGreaterThan(3);
    const texts = await db.documentChunk.findMany({
      where: { id: { in: entry.sources.map((s) => s.replace("chunk:", "")) } },
      select: { content: true },
    });
    expect(texts.some((t) => t.content.includes("changed to 7 percent"))).toBe(
      true,
    );
  });
});

describe("chat loop", () => {
  it("rejects scope the user does not belong to with a 404-style error", async () => {
    const { assistant } = assistantWith([finalText("hi")]);
    await expect(
      assistant.chat(ids.userOther, ask({ team_id: ids.teamNorth })),
    ).rejects.toMatchObject({ statusCode: 404 });
    // A team the user is not a member of is refused, whoever else is in it.
    await expect(
      assistant.chat(ids.userAdmin, ask({ team_id: ids.teamSouth })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("maps citations to issued sources only and drops forged ones", async () => {
    const chunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: ids.docNorthContract },
      select: { id: true },
    });
    const southChunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: ids.docSouthContract },
      select: { id: true },
    });
    const { assistant } = assistantWith([
      toolUse("search_documents", { query: "monthly rent 1200" }),
      finalText("The rent is 1200 EUR.", [
        {
          type: "search_result_location",
          source: `chunk:${chunk.id}`,
          title: "x",
          cited_text: "The monthly rent is 1200 EUR",
          search_result_index: 0,
          start_block_index: 0,
          end_block_index: 1,
        },
        {
          type: "search_result_location",
          source: `chunk:${southChunk.id}`,
          title: "forged",
          cited_text: "leak",
          search_result_index: 1,
          start_block_index: 0,
          end_block_index: 1,
        },
      ]),
    ]);
    const response = chatResponseSchema.parse(
      await assistant.chat(ids.userAdmin, ask()),
    );
    expect(response.citations).toHaveLength(1);
    expect(response.citations[0]).toMatchObject({
      document_id: ids.docNorthContract,
      page_start: 1,
      quote: "The monthly rent is 1200 EUR",
    });
    expect(response.citations[0]?.preview_url).toBe(
      `/api/documents/${ids.docNorthContract}/preview`,
    );
    expect(response.answer).toEqual([
      { text: "The rent is 1200 EUR.", citations: [1] },
    ]);
    expect(response.state.document_ids).toContain(ids.docNorthContract);
    expect(response.usage).toMatchObject({
      model: "claude-test",
      model_calls: 2,
      stopped_by_budget: false,
    });
  });

  it("asks once for citations when an answer on retrieved passages has none", async () => {
    const chunk = await db.documentChunk.findFirstOrThrow({
      where: { documentId: ids.docNorthContract },
      select: { id: true },
    });
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", { query: "monthly rent 1200" }),
      finalText("The rent is 1200 EUR."),
      finalText("The rent is 1200 EUR.", [
        {
          type: "search_result_location",
          source: `chunk:${chunk.id}`,
          title: "x",
          cited_text: "The monthly rent is 1200 EUR",
          search_result_index: 0,
          start_block_index: 0,
          end_block_index: 1,
        },
      ]),
    ]);
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(3);
    expect(response.citations).toHaveLength(1);
    expect(response.answer[0]?.citations).toEqual([1]);
  });

  it("keeps the first answer when the citation repeat is also uncited", async () => {
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", { query: "monthly rent 1200" }),
      finalText("The rent is 1200 EUR."),
    ]);
    const response = await assistant.chat(ids.userAdmin, ask());
    // One repeat only, never a loop.
    expect(requests).toHaveLength(3);
    expect(response.answer.map((part) => part.text).join("")).toContain(
      "1200 EUR",
    );
    expect(response.citations).toEqual([]);
  });

  it("marks an answer cut off by the length limit and does not ask it for citations", async () => {
    const cutOff: ModelStep = () => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "The rent is", citations: [] }] as never,
    });
    const { assistant, requests } = assistantWith([
      toolUse("search_documents", { query: "monthly rent 1200" }),
      cutOff,
    ]);
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(2);
    expect(response.answer[0]?.text).toBe("The rent is");
    expect(response.answer.at(-1)?.text).toContain("cut off");
  });

  it("stops at the step budget and says so", async () => {
    const { assistant, requests } = assistantWith(
      [toolUse("search_records", { query: "2026-001" })],
      { maxSteps: 3 },
    );
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(3);
    expect(response.usage.stopped_by_budget).toBe(true);
    expect(response.answer.at(-1)?.text).toContain("allowed number of steps");
  });

  it("asks once for an answer when the model replies without text", async () => {
    const empty: ModelStep = () => ({ stop_reason: "end_turn", content: [] });
    const { assistant, requests } = assistantWith([
      toolUse("search_records", { query: "2026-001" }),
      empty,
      finalText("Here is the answer."),
    ]);
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(3);
    expect(response.answer.at(-1)?.text).toBe("Here is the answer.");
    expect(response.usage.stopped_by_budget).toBe(false);
  });

  it("reports an empty answer as such, not as a budget stop", async () => {
    const empty: ModelStep = () => ({ stop_reason: "end_turn", content: [] });
    const { assistant, requests } = assistantWith([empty]);
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(2);
    expect(response.usage.stopped_by_budget).toBe(false);
    expect(response.answer.at(-1)?.text).toContain("could not produce");
    expect(response.answer.at(-1)?.text).not.toContain("allowed number");
  });

  it("stops when one request grows beyond the context budget", async () => {
    const huge: ModelStep = () => ({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "search_records",
          input: { query: "x" },
        },
      ] as never,
      input: 500_000,
    });
    const { assistant, requests } = assistantWith([huge], {
      maxInputTokens: 1000,
    });
    const response = await assistant.chat(ids.userAdmin, ask());
    expect(requests).toHaveLength(1);
    expect(response.usage.stopped_by_budget).toBe(true);
    // Too much text is reported as such, not as too many steps.
    expect(response.answer.at(-1)?.text).toContain("more text than I can work");
  });

  it("returns invalid tool arguments as an error result, not a crash", async () => {
    const { assistant, requests } = assistantWith([
      toolUse("get_property", { property_id: "not-a-uuid" }),
      finalText("ok"),
    ]);
    await assistant.chat(ids.userAdmin, ask());
    expect(lastToolResult(requests[1]!).isError).toBe(true);
  });

  it("drops leading assistant turns so the conversation starts with the user", async () => {
    const { assistant, requests } = assistantWith([finalText("fine")]);
    await assistant.chat(
      ids.userAdmin,
      ask({
        history: [
          { role: "assistant", content: "stray greeting" },
          { role: "user", content: "earlier question" },
        ],
      }),
    );
    expect(requests[0]!.messages.map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("sends only plain history and a cached prefix to the model, with no earlier deal", async () => {
    const { assistant, requests } = assistantWith([finalText("fine")]);
    await assistant.chat(
      ids.userAdmin,
      ask({
        history: [
          { role: "user", content: "earlier question" },
          { role: "assistant", content: "earlier answer" },
        ],
        state: { deal_ids: [ids.dealNorthSale], document_ids: [] },
      }),
    );
    const request = requests[0]!;
    expect(request.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    const system = request.system as {
      text: string;
      cache_control?: unknown;
    }[];
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    // An earlier deal must not steer the next question.
    expect(system[0]?.text).not.toContain(ids.dealNorthSale);
    expect(system[0]?.text).toContain("Today is 2026-06-01");
    expect(
      (request.tools as { name: string }[] | undefined)?.map(
        (tool) => tool.name,
      ),
    ).toEqual(["search_records", "get_property", "search_documents"]);
    const last = request.messages.at(-1)!;
    const blocks = last.content as { cache_control?: unknown }[];
    expect(blocks.at(-1)?.cache_control).toEqual({ type: "ephemeral" });
  });
});

async function collect(events: AsyncIterable<ChatStreamEvent>) {
  const all: ChatStreamEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("streamed answers", () => {
  it("reports the answer in pieces and ends with the same answer as chat()", async () => {
    const { assistant, calls } = assistantWith([
      finalText("The rent is 1200 EUR."),
    ]);
    const events = await collect(
      await assistant.chatStream(ids.userAdmin, ask()),
    );
    expect(events.map((event) => event.type)).toEqual([
      "delta",
      "delta",
      "final",
    ]);
    const text = events
      .flatMap((event) => (event.type === "delta" ? [event.text] : []))
      .join("");
    const last = events.at(-1);
    if (last?.type !== "final") throw new Error("expected a final event");
    expect(text).toBe(last.response.answer.map((part) => part.text).join(""));
    expect(calls.every((call) => call.streamed)).toBe(true);
    for (const event of events) chatStreamEventSchema.parse(event);
  });

  it("discards text written before a tool call and announces the search", async () => {
    const withPreamble: ModelStep = () => ({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Let me look that up.", citations: [] },
        {
          type: "tool_use",
          id: "t1",
          name: "search_records",
          input: { query: "2026-001" },
        },
      ] as never,
    });
    const { assistant } = assistantWith([withPreamble, finalText("Done.")]);
    const types = (
      await collect(await assistant.chatStream(ids.userAdmin, ask()))
    ).map((event) =>
      event.type === "status" ? `status:${event.stage}` : event.type,
    );
    expect(types).toEqual([
      "delta",
      "delta",
      "reset",
      "status:searching",
      "delta",
      "delta",
      "final",
    ]);
  });

  it("refuses a foreign scope before any event, like chat()", async () => {
    const { assistant, requests } = assistantWith([finalText("never")]);
    await expect(
      assistant.chatStream(ids.userOther, ask()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(requests).toHaveLength(0);
  });

  it("turns a provider failure into an error event without its details", async () => {
    const failing = {
      createMessage: () => Promise.reject(new Error("secret provider detail")),
    };
    const assistant = createAssistant({
      llm: failing,
      model: "claude-test",
      repository,
      embedder: fakeEmbedder,
      getTeamScope: (userId, teamId) =>
        teams.getAccessibleTeamScope(userId, teamId),
    });
    const seen: unknown[] = [];
    const events = await collect(
      await assistant.chatStream(ids.userAdmin, ask(), {
        onError: (error) => seen.push(error),
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      code: "ASSISTANT_UNAVAILABLE",
    });
    expect(JSON.stringify(events)).not.toContain("secret");
    expect(seen).toHaveLength(1);
  });

  it("passes the abort signal to the model and stops before a new call", async () => {
    const controller = new AbortController();
    const first = assistantWith([finalText("first")]);
    await collect(
      await first.assistant.chatStream(ids.userAdmin, ask(), {
        signal: controller.signal,
      }),
    );
    expect(first.calls[0]?.signal).toBe(controller.signal);

    controller.abort();
    const again = assistantWith([finalText("second")]);
    const events = await collect(
      await again.assistant.chatStream(ids.userAdmin, ask(), {
        signal: controller.signal,
      }),
    );
    expect(again.requests).toHaveLength(0);
    expect(events.map((event) => event.type)).toEqual(["error"]);
  });
});

describe("POST /api/chat", () => {
  const post = (
    app: ReturnType<typeof createApp>,
    cookie: string | undefined,
    payload: unknown,
  ) =>
    app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      payload: payload as object,
    });

  it("is absent without model keys", async () => {
    const app = createApp(testConfig(), { database: db });
    const cookie = await login(app, accounts.admin);
    expect((await post(app, cookie, ask())).statusCode).toBe(404);
    await app.close();
  });

  it("authenticates, validates, scopes, limits and hides provider failures", async () => {
    const { llm } = scriptedModel([finalText("Hello")]);
    const app = createApp(testConfig(), {
      database: db,
      assistantClients: { llm, embedder: fakeEmbedder },
      assistantConfig: {
        ASSISTANT_MODEL: "claude-test",
        EMBEDDING_MODEL: "fake",
        EMBEDDING_DIMENSIONS: 1024,
        ASSISTANT_MAX_STEPS: 4,
        ASSISTANT_REQUESTS_PER_MINUTE: 3,
      },
    });
    expect((await post(app, undefined, ask())).statusCode).toBe(401);
    const admin = await login(app, accounts.admin);
    const other = await login(app, accounts.other);

    // Tool results (or any unknown field) are never accepted from the client.
    expect(
      (
        await post(app, admin, {
          ...ask(),
          history: [{ role: "user", content: "x", tool_results: [] }],
        })
      ).statusCode,
    ).toBe(400);
    expect((await post(app, admin, { ...ask(), message: "" })).statusCode).toBe(
      400,
    );
    expect((await post(app, other, ask())).statusCode).toBe(404);

    const ok = await post(app, admin, ask());
    expect(ok.statusCode).toBe(200);
    expect(chatResponseSchema.parse(ok.json()).answer[0]?.text).toBe("Hello");

    // Limit is 3 per minute per user: two more pass, the fourth is refused.
    expect((await post(app, admin, ask())).statusCode).toBe(200);
    expect((await post(app, admin, ask())).statusCode).toBe(200);
    const limited = await post(app, admin, ask());
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    await app.close();
  });

  it("answers 503 without details when the model call fails", async () => {
    const failing = {
      createMessage: () => Promise.reject(new Error("secret provider detail")),
    };
    const app = createApp(testConfig(), {
      database: db,
      assistantClients: { llm: failing, embedder: fakeEmbedder },
    });
    const admin = await login(app, accounts.admin);
    const response = await post(app, admin, ask());
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("secret provider detail");
    expect(response.json()).toMatchObject({ code: "ASSISTANT_UNAVAILABLE" });
    await app.close();
  });
});

describe("POST /api/chat/stream", () => {
  const post = (
    app: ReturnType<typeof createApp>,
    cookie: string | undefined,
    payload: unknown,
  ) =>
    app.inject({
      method: "POST",
      url: "/api/chat/stream",
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      payload: payload as object,
    });
  const config = {
    ASSISTANT_MODEL: "claude-test",
    EMBEDDING_MODEL: "fake",
    EMBEDDING_DIMENSIONS: 1024,
    ASSISTANT_MAX_STEPS: 4,
    ASSISTANT_REQUESTS_PER_MINUTE: 2,
  };
  const parse = (body: string) =>
    body
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => chatStreamEventSchema.parse(JSON.parse(line)));

  it("streams NDJSON events with no-transform headers, then the final answer", async () => {
    const { llm } = scriptedModel([finalText("Hello there")]);
    const app = createApp(testConfig(), {
      database: db,
      assistantClients: { llm, embedder: fakeEmbedder },
      assistantConfig: config,
    });
    const admin = await login(app, accounts.admin);
    const response = await post(app, admin, ask());
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["cache-control"]).toContain("no-transform");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    const events = parse(response.body);
    expect(events[0]).toEqual({ type: "status", stage: "working" });
    const last = events.at(-1);
    if (last?.type !== "final") throw new Error("expected a final event");
    expect(last.response.answer[0]?.text).toBe("Hello there");
    await app.close();
  });

  it("keeps authentication, validation, scope and limits as plain HTTP errors", async () => {
    const { llm } = scriptedModel([finalText("Hello")]);
    const app = createApp(testConfig(), {
      database: db,
      assistantClients: { llm, embedder: fakeEmbedder },
      assistantConfig: config,
    });
    expect((await post(app, undefined, ask())).statusCode).toBe(401);
    const admin = await login(app, accounts.admin);
    const other = await login(app, accounts.other);
    expect((await post(app, admin, { ...ask(), message: "" })).statusCode).toBe(
      400,
    );
    const foreign = await post(app, other, ask());
    expect(foreign.statusCode).toBe(404);
    expect(foreign.headers["content-type"]).toContain("application/json");
    expect((await post(app, admin, ask())).statusCode).toBe(200);
    expect((await post(app, admin, ask())).statusCode).toBe(200);
    expect((await post(app, admin, ask())).statusCode).toBe(429);
    await app.close();
  });

  it("reports a model failure as an error event without details", async () => {
    const failing = {
      createMessage: () => Promise.reject(new Error("secret provider detail")),
    };
    const app = createApp(testConfig(), {
      database: db,
      assistantClients: { llm: failing, embedder: fakeEmbedder },
    });
    const admin = await login(app, accounts.admin);
    const response = await post(app, admin, ask());
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("secret provider detail");
    expect(parse(response.body).at(-1)).toMatchObject({
      type: "error",
      code: "ASSISTANT_UNAVAILABLE",
    });
    await app.close();
  });
});
