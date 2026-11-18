import type { Database } from "../../../infrastructure/database/index.js";

/**
 * Every query is scoped to one team the caller is already known to belong to
 * (checked by the service): a document counts when its deal or the document
 * itself belongs to that team.
 */
export type SearchScope = { teamId: string; dealId?: string | undefined };

export type DocumentFilters = {
  documentType?: string | undefined;
  documentId?: string | undefined;
  /** Restrict to these deals (used for amendment checks). */
  dealId?: string | undefined;
};

export type ChunkHit = {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  section: string | null;
  content: string;
  title: string;
  type: string;
  dealId: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  effectiveFrom: string | null;
  status: string;
  parentDocumentId: string | null;
  processingStatus: string;
  /** Cosine similarity to the query, set by the vector search only. */
  similarity?: number | null;
};

export type DealRecord = {
  dealId: string;
  number: string;
  type: string;
  teamName: string;
  propertyId: string;
  address: string;
  clientName: string;
};

export type AmendmentRow = {
  documentId: string;
  title: string;
  documentNumber: string | null;
  documentDate: string | null;
  effectiveFrom: string | null;
  status: string;
  processingStatus: string;
  parentDocumentId: string | null;
};

type RawHit = {
  chunk_id: string;
  document_id: string;
  page_start: number;
  page_end: number;
  section: string | null;
  content: string;
  title: string;
  type: string;
  deal_id: string | null;
  document_number: string | null;
  document_date: string | null;
  effective_from: string | null;
  status: string;
  parent_document_id: string | null;
  processing_status: string;
  similarity?: number | null;
};

const toHit = (row: RawHit): ChunkHit => ({
  chunkId: row.chunk_id,
  documentId: row.document_id,
  pageStart: row.page_start,
  pageEnd: row.page_end,
  section: row.section,
  content: row.content,
  title: row.title,
  type: row.type,
  dealId: row.deal_id,
  documentNumber: row.document_number,
  documentDate: row.document_date,
  effectiveFrom: row.effective_from,
  status: row.status,
  parentDocumentId: row.parent_document_id,
  processingStatus: row.processing_status,
  ...(row.similarity != null ? { similarity: Number(row.similarity) } : {}),
});

export const toVectorLiteral = (values: number[]) => `[${values.join(",")}]`;

export function createRetrievalRepository(database: Database) {
  return {
    /** Deals of the team matching any token (scored further in the domain). */
    async findDeals(
      scope: SearchScope,
      tokens: string[],
      limit: number,
    ): Promise<DealRecord[]> {
      const rows = await database.deal.findMany({
        where: {
          teamId: scope.teamId,
          ...(scope.dealId ? { id: scope.dealId } : {}),
          ...(tokens.length
            ? {
                OR: tokens.flatMap((token) => [
                  { number: { contains: token, mode: "insensitive" as const } },
                  {
                    property: {
                      address: {
                        contains: token,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                  {
                    client: {
                      name: { contains: token, mode: "insensitive" as const },
                    },
                  },
                ]),
              }
            : {}),
        },
        take: limit,
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          type: true,
          team: { select: { name: true } },
          property: { select: { id: true, address: true } },
          client: { select: { name: true } },
        },
      });
      return rows.map((row) => ({
        dealId: row.id,
        number: row.number,
        type: row.type,
        teamName: row.team.name,
        propertyId: row.property.id,
        address: row.property.address,
        clientName: row.client.name,
      }));
    },

    /** The property and its deals in the team; null when the team has none. */
    async findProperty(scope: SearchScope, propertyId: string) {
      const deals = await database.deal.findMany({
        where: {
          teamId: scope.teamId,
          propertyId,
          ...(scope.dealId ? { id: scope.dealId } : {}),
        },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          type: true,
          property: { select: { address: true } },
          client: { select: { name: true } },
        },
      });
      const first = deals[0];
      if (!first) return null;
      return {
        propertyId,
        address: first.property.address,
        deals: deals.map((deal) => ({
          dealId: deal.id,
          number: deal.number,
          type: deal.type,
          clientName: deal.client.name,
        })),
      };
    },

    async vectorSearch(
      scope: SearchScope,
      filters: DocumentFilters,
      embedding: number[],
      limit: number,
    ): Promise<ChunkHit[]> {
      const dealId = filters.dealId ?? scope.dealId ?? null;
      const rows = await database.$queryRaw<RawHit[]>`
        SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end,
               c.section, c.content, d.title, d.type::text AS type, d.deal_id,
               d.document_number, d.document_date::text AS document_date,
               d.effective_from::text AS effective_from, d.status::text AS status,
               d.parent_document_id, d.processing_status::text AS processing_status,
               1 - (c.embedding <=> ${toVectorLiteral(embedding)}::vector) AS similarity
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        LEFT JOIN deals dl ON dl.id = d.deal_id
        WHERE COALESCE(dl.team_id, d.team_id) = ${scope.teamId}::uuid
          AND (${dealId}::uuid IS NULL OR d.deal_id = ${dealId}::uuid)
          AND (${filters.documentType ?? null}::text IS NULL OR d.type::text = ${filters.documentType ?? null}::text)
          AND (${filters.documentId ?? null}::uuid IS NULL OR d.id = ${filters.documentId ?? null}::uuid)
        ORDER BY c.embedding <=> ${toVectorLiteral(embedding)}::vector
        LIMIT ${limit}`;
      return rows.map(toHit);
    },

    /**
     * For each of the given documents, its `perDocument` chunks closest to any
     * of the source chunks (cosine similarity, from the stored embeddings, so
     * no embedding call is needed). Used to find the amendment text that
     * rewrites a clause of the contract.
     */
    async similarToChunks(
      scope: SearchScope,
      sourceChunkIds: string[],
      documentIds: string[],
      perDocument: number,
    ): Promise<ChunkHit[]> {
      if (sourceChunkIds.length === 0 || documentIds.length === 0) return [];
      const rows = await database.$queryRaw<RawHit[]>`
        SELECT * FROM (
          SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end,
                 c.section, c.content, d.title, d.type::text AS type, d.deal_id,
                 d.document_number, d.document_date::text AS document_date,
                 d.effective_from::text AS effective_from, d.status::text AS status,
                 d.parent_document_id, d.processing_status::text AS processing_status,
                 near.similarity,
                 ROW_NUMBER() OVER (PARTITION BY c.document_id ORDER BY near.similarity DESC) AS rank
          FROM document_chunks c
          JOIN documents d ON d.id = c.document_id
          LEFT JOIN deals dl ON dl.id = d.deal_id
          CROSS JOIN LATERAL (
            SELECT max(1 - (c.embedding <=> s.embedding)) AS similarity
            FROM document_chunks s
            WHERE s.id = ANY(${sourceChunkIds}::uuid[])
          ) near
          WHERE COALESCE(dl.team_id, d.team_id) = ${scope.teamId}::uuid
            AND c.document_id = ANY(${documentIds}::uuid[])
            AND near.similarity IS NOT NULL
        ) ranked
        WHERE rank <= ${perDocument}
        ORDER BY similarity DESC`;
      return rows.map(toHit);
    },

    /**
     * Keyword search. "web" needs every word in one passage; "phrase" needs the
     * words next to each other, which is how a person's name is found even in
     * a long question.
     */
    async textSearch(
      scope: SearchScope,
      filters: DocumentFilters,
      query: string,
      limit: number,
      mode: "web" | "phrase" = "web",
    ): Promise<ChunkHit[]> {
      const dealId = filters.dealId ?? scope.dealId ?? null;
      const rows = await database.$queryRaw<RawHit[]>`
        SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end,
               c.section, c.content, d.title, d.type::text AS type, d.deal_id,
               d.document_number, d.document_date::text AS document_date,
               d.effective_from::text AS effective_from, d.status::text AS status,
               d.parent_document_id, d.processing_status::text AS processing_status
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        LEFT JOIN deals dl ON dl.id = d.deal_id
        WHERE COALESCE(dl.team_id, d.team_id) = ${scope.teamId}::uuid
          AND (${dealId}::uuid IS NULL OR d.deal_id = ${dealId}::uuid)
          AND (${filters.documentType ?? null}::text IS NULL OR d.type::text = ${filters.documentType ?? null}::text)
          AND (${filters.documentId ?? null}::uuid IS NULL OR d.id = ${filters.documentId ?? null}::uuid)
          AND c.content_tsv @@ (CASE WHEN ${mode} = 'phrase'
                THEN phraseto_tsquery('simple', ${query})
                ELSE websearch_to_tsquery('simple', ${query}) END)
        ORDER BY ts_rank(c.content_tsv, (CASE WHEN ${mode} = 'phrase'
                THEN phraseto_tsquery('simple', ${query})
                ELSE websearch_to_tsquery('simple', ${query}) END)) DESC
        LIMIT ${limit}`;
      return rows.map(toHit);
    },

    /** All chunks of one document in reading order (scope-checked). */
    async chunksOfDocument(
      scope: SearchScope,
      documentId: string,
    ): Promise<ChunkHit[]> {
      const rows = await database.$queryRaw<RawHit[]>`
        SELECT c.id AS chunk_id, c.document_id, c.page_start, c.page_end,
               c.section, c.content, d.title, d.type::text AS type, d.deal_id,
               d.document_number, d.document_date::text AS document_date,
               d.effective_from::text AS effective_from, d.status::text AS status,
               d.parent_document_id, d.processing_status::text AS processing_status
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        LEFT JOIN deals dl ON dl.id = d.deal_id
        WHERE COALESCE(dl.team_id, d.team_id) = ${scope.teamId}::uuid
          AND d.id = ${documentId}::uuid
        ORDER BY c.ordinal`;
      return rows.map(toHit);
    },

    /** Amendments of a deal: linked to the contract, or not linked at all. */
    async amendmentsForContract(
      scope: SearchScope,
      dealId: string,
      contractId: string,
    ): Promise<{ linked: AmendmentRow[]; unlinked: AmendmentRow[] }> {
      const rows = await database.document.findMany({
        where: {
          dealId,
          deal: { teamId: scope.teamId },
          type: "amendment",
          OR: [{ parentDocumentId: contractId }, { parentDocumentId: null }],
        },
        orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          documentNumber: true,
          documentDate: true,
          effectiveFrom: true,
          status: true,
          processingStatus: true,
          parentDocumentId: true,
        },
      });
      const iso = (value: Date | null) =>
        value ? value.toISOString().slice(0, 10) : null;
      const mapped = rows.map<AmendmentRow>((row) => ({
        documentId: row.id,
        title: row.title,
        documentNumber: row.documentNumber,
        documentDate: iso(row.documentDate),
        effectiveFrom: iso(row.effectiveFrom),
        status: row.status,
        processingStatus: row.processingStatus,
        parentDocumentId: row.parentDocumentId,
      }));
      return {
        linked: mapped.filter((row) => row.parentDocumentId === contractId),
        unlinked: mapped.filter((row) => row.parentDocumentId === null),
      };
    },

    async contractMetadata(scope: SearchScope, contractId: string) {
      const row = await database.document.findFirst({
        where: {
          id: contractId,
          type: "contract",
          deal: { teamId: scope.teamId },
        },
        select: {
          id: true,
          dealId: true,
          title: true,
          documentNumber: true,
          documentDate: true,
        },
      });
      return row && row.dealId
        ? {
            documentId: row.id,
            dealId: row.dealId,
            title: row.title,
            documentNumber: row.documentNumber,
            documentDate: row.documentDate
              ? row.documentDate.toISOString().slice(0, 10)
              : null,
          }
        : null;
    },

    /** Contracts of the deal (to resolve an unlinked amendment). */
    async contractsOfDeal(scope: SearchScope, dealId: string) {
      const rows = await database.document.findMany({
        where: {
          dealId,
          type: "contract",
          deal: { teamId: scope.teamId },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
  };
}
export type RetrievalRepository = ReturnType<typeof createRetrievalRepository>;
