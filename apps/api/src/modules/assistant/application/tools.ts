import type {
  SearchResultBlockParam,
  TextBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { uuidSchema } from "@agency/contracts";
import { z } from "zod";
import { matchRecord, queryTokens } from "../domain/record-matching.js";
import type {
  ChunkHit,
  RetrievalRepository,
  SearchScope,
} from "../infrastructure/retrieval-repository.js";
import type { DocumentSearch } from "./document-search.js";

/** What a returned search result points at; used to resolve citations. */
export type SourceRef = {
  source: string;
  documentId: string;
  title: string;
  pageStart: number;
  pageEnd: number;
};

export type ToolOutput = {
  content: Array<TextBlockParam | SearchResultBlockParam>;
  isError?: boolean;
};

const MAX_RECORDS = 8;
const documentTypeSchema = z.enum([
  "contract",
  "amendment",
  "listing_sheet",
  "handover_report",
  "other",
]);

const searchRecordsInput = z.strictObject({
  query: z.string().trim().min(1).max(300),
});
const getPropertyInput = z.strictObject({ property_id: uuidSchema });
const searchDocumentsInput = z.strictObject({
  query: z.string().trim().min(1).max(500),
  filters: z
    .strictObject({
      deal_id: uuidSchema.optional(),
      document_type: documentTypeSchema.optional(),
      document_id: uuidSchema.optional(),
    })
    .optional(),
});

const schemaOf = (schema: z.ZodType): Tool["input_schema"] => {
  const converted = z.toJSONSchema(schema, { io: "input" });
  delete converted.$schema;
  return converted as Tool["input_schema"];
};

export const toolDefinitions: Tool[] = [
  {
    name: "search_records",
    description:
      "Find deals and properties of the selected team by deal number, part of an address or the client's name. Tenants, guarantors, buyers and other parties are NOT searched here: find them with search_documents. Returns exact addresses, deal numbers and internal IDs to use in later calls. Use it first when the user names a deal or an address.",
    input_schema: schemaOf(searchRecordsInput),
  },
  {
    name: "get_property",
    description:
      "Get a property by the property_id returned from search_records: its address and the deals linked to it. Tenant, rent and commission are NOT stored here: read them from the contracts with search_documents.",
    input_schema: schemaOf(getPropertyInput),
  },
  {
    name: "search_documents",
    description:
      "Search the text of contracts, amendments, listing sheets, reports and shared team documents. Returns cited passages with page numbers. For contract terms it also returns every related amendment with its signing status and effective date, and lists what could not be verified. Optional filters: deal_id, document_type, document_id.",
    input_schema: schemaOf(searchDocumentsInput),
  },
];

const pages = (hit: { pageStart: number; pageEnd: number }) =>
  hit.pageStart === hit.pageEnd
    ? `p. ${hit.pageStart}`
    : `pp. ${hit.pageStart}-${hit.pageEnd}`;

export function createToolRunner(deps: {
  repository: RetrievalRepository;
  search: DocumentSearch;
  scope: SearchScope;
  /** The question being answered now, not earlier turns. */
  userMessage: string;
  /** Receives every source returned to the model in this request. */
  registerSource: (ref: SourceRef) => void;
  /** Deals and documents surfaced to the model (state for later turns). */
  noteDeal?: (dealId: string) => void;
  noteDocument?: (documentId: string) => void;
}) {
  const { repository, search, scope } = deps;
  /**
   * Deals the user's current message names (by number, address or client).
   * Only these may narrow a search: a deal remembered from an earlier turn
   * never does, so by default the whole team is searched.
   */
  let named: Set<string> | undefined;
  async function namedDeals(): Promise<Set<string>> {
    if (named) return named;
    const tokens = queryTokens(deps.userMessage);
    const deals = await repository.findDeals(scope, tokens, 50);
    named = new Set(
      deals
        .filter(
          (deal) =>
            matchRecord(tokens, {
              number: deal.number,
              address: deal.address,
              clientName: deal.clientName,
            }) !== null,
        )
        .map((deal) => deal.dealId),
    );
    return named;
  }

  const text = (value: unknown): TextBlockParam => ({
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value),
  });

  function resultBlock(hit: ChunkHit): SearchResultBlockParam {
    const source = `chunk:${hit.chunkId}`;
    const title = `${hit.title} (${pages(hit)})`;
    deps.noteDocument?.(hit.documentId);
    if (hit.dealId) deps.noteDeal?.(hit.dealId);
    deps.registerSource({
      source,
      documentId: hit.documentId,
      title: hit.title,
      pageStart: hit.pageStart,
      pageEnd: hit.pageEnd,
    });
    return {
      type: "search_result",
      source,
      title,
      content: [{ type: "text", text: hit.content }],
      citations: { enabled: true },
    };
  }

  const handlers: Record<string, (input: unknown) => Promise<ToolOutput>> = {
    async search_records(raw) {
      const { query } = searchRecordsInput.parse(raw);
      const tokens = queryTokens(query);
      const deals = await repository.findDeals(scope, tokens, 50);
      const matches = deals
        .map((deal) => ({
          deal,
          match: matchRecord(tokens, {
            number: deal.number,
            address: deal.address,
            clientName: deal.clientName,
          }),
        }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => b.match!.score - a.match!.score)
        .slice(0, MAX_RECORDS);
      for (const { deal } of matches) deps.noteDeal?.(deal.dealId);
      if (matches.length === 0)
        return {
          content: [
            text({
              matches: [],
              note: "No deal or property matched. Ask for a street number, unit or deal number.",
            }),
          ],
        };
      const partialOnly = !matches.some(({ match }) => match!.complete);
      return {
        content: [
          text({
            ...(partialOnly
              ? {
                  warning:
                    "No record matched every word of the query; these are partial matches (for example a shared first name). If the query is a person's name (tenant, landlord, guarantor, buyer), search_documents for the full name before answering, and do not present these deals as the answer.",
                }
              : {}),
            matches: matches.map(({ deal, match }) => ({
              deal_id: deal.dealId,
              deal_number: deal.number,
              deal_type: deal.type,
              team: deal.teamName,
              property_id: deal.propertyId,
              address: deal.address,
              client: deal.clientName,
              matched_by: match!.matchedBy,
              score: match!.score,
            })),
          }),
        ],
      };
    },

    async get_property(raw) {
      const { property_id } = getPropertyInput.parse(raw);
      const property = await repository.findProperty(scope, property_id);
      // A property of another team looks exactly like a missing one.
      if (!property)
        return {
          content: [text("Property not found in the selected team.")],
          isError: true,
        };
      return {
        content: [
          text({
            property_id: property.propertyId,
            address: property.address,
            deals: property.deals.map((deal) => ({
              deal_id: deal.dealId,
              deal_number: deal.number,
              deal_type: deal.type,
              client: deal.clientName,
            })),
            note: "Tenant, rent and commission are not stored on the property; read the contracts.",
          }),
        ],
      };
    },

    async search_documents(raw) {
      const { query, filters } = searchDocumentsInput.parse(raw);
      if (filters?.deal_id && !(await namedDeals()).has(filters.deal_id))
        return {
          content: [
            text(
              "deal_id was refused: the user's current message does not name that deal. Repeat the search without deal_id to cover every deal of the team, or ask the user for the deal number or address.",
            ),
          ],
          isError: true,
        };
      const result = await search.search(
        scope,
        {
          dealId: filters?.deal_id,
          documentType: filters?.document_type,
          documentId: filters?.document_id,
        },
        query,
      );
      if (result.chunks.length === 0)
        return {
          content: [
            text({
              passages: 0,
              gaps: [
                "No indexed document text matched. The documents may not be indexed yet or may not contain this information.",
                ...result.gaps,
              ],
            }),
          ],
        };
      const blocks: Array<TextBlockParam | SearchResultBlockParam> = [];
      // The API forbids mixing text and search_result blocks in one tool
      // result, so the overview is a search_result as well. It is never
      // registered as a source, so it cannot be cited.
      const overview = (value: unknown): SearchResultBlockParam => ({
        type: "search_result",
        source: "overview:search",
        title: "Search overview: amendments, signing status, gaps",
        content: [{ type: "text", text: JSON.stringify(value) }],
        citations: { enabled: true },
      });
      blocks.push(
        overview({
          passages: result.chunks.map((hit) => ({
            source: `chunk:${hit.chunkId}`,
            document_id: hit.documentId,
            deal_id: hit.dealId,
            document_type: hit.type,
            title: hit.title,
            document_number: hit.documentNumber,
            document_date: hit.documentDate,
            effective_from: hit.effectiveFrom,
            signing_status: hit.status,
            pages: pages(hit),
            section: hit.section,
          })),
          amendments: result.amendments.map((amendment) => ({
            document_id: amendment.document_id,
            title: amendment.title,
            document_number: amendment.document_number,
            document_date: amendment.document_date,
            effective_from: amendment.effective_from,
            signing_status: amendment.signing_status,
            link: amendment.link,
            ...(amendment.link_reason
              ? { link_reason: amendment.link_reason }
              : {}),
            sources: amendment.chunks.map((chunk) => `chunk:${chunk.chunkId}`),
            matched_by: amendment.matched_by,
            ...(amendment.snippet
              ? { text_not_included: true, extract: amendment.snippet }
              : {}),
          })),
          gaps: result.gaps,
        }),
      );
      const seen = new Set<string>();
      for (const hit of [
        ...result.chunks,
        ...result.amendments.flatMap((amendment) => amendment.chunks),
      ]) {
        if (seen.has(hit.chunkId)) continue;
        seen.add(hit.chunkId);
        blocks.push(resultBlock(hit));
      }
      return { content: blocks };
    },
  };

  return {
    async run(name: string, input: unknown): Promise<ToolOutput> {
      const handler = handlers[name];
      if (!handler)
        return { content: [text(`Unknown tool ${name}`)], isError: true };
      try {
        return await handler(input);
      } catch (error) {
        // Argument errors are useful to the model; internals are not.
        if (error instanceof z.ZodError)
          return {
            content: [text("Invalid tool arguments. Check the input schema.")],
            isError: true,
          };
        throw error;
      }
    },
  };
}
export type ToolRunner = ReturnType<typeof createToolRunner>;
