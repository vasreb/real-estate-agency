import type { Embedder } from "../../indexing/index.js";
import type {
  AmendmentRow,
  ChunkHit,
  DocumentFilters,
  RetrievalRepository,
  SearchScope,
} from "../infrastructure/retrieval-repository.js";

const CANDIDATES = 20;
const TOP_RESULTS = 8;
const RRF_K = 60;
/** Passages taken per person name found in the question. */
const NAME_HITS = 4;
/** An amendment up to this many characters is passed to the model whole. */
/** Passages shown per amendment whose text is included. */
const AMENDMENT_HITS = 2;
/**
 * Amendments whose text goes to the model for one search; the rest are listed
 * with status, dates and a short extract so the context stays small.
 */
const MAX_AMENDMENT_TEXTS = 4;
const SNIPPET_CHARS = 240;
const MAX_AMENDMENTS = 12;
/** Contracts (deals) whose amendments are expanded for one search. */
const MAX_CONTRACTS = 4;

/** Contract passages used as the "clause" an amendment may rewrite. */
const CLAUSE_SOURCES = 3;
/** Clause numbers looked up in amendments per contract. */
const MAX_CLAUSE_NUMBERS = 6;
/**
 * Added to a passage that cites a clause number of the contract. With the
 * base below it puts such a passage above any similarity (at most 1): an
 * explicit citation of the clause is stronger evidence than a topical match.
 */
const REFERENCE_BONUS = 0.5;
/** Assumed similarity of a passage found only by its clause number. */
const REFERENCE_BASE = 0.5;

/**
 * Clause numbers of a contract passage: its section and every numbered
 * heading line ("4.2 Fees", "7. Term"), so an amendment that says "clause 4.2"
 * can be matched to the passage.
 */
export function clauseNumbers(
  section: string | null,
  content: string,
): string[] {
  const found: string[] = [];
  const add = (raw: string | undefined) => {
    const number = raw?.replace(/\.$/, "");
    if (number && !found.includes(number)) found.push(number);
  };
  add(
    section?.match(/^(?:(?:clause|section|article)\s+)?(\d+(?:\.\d+)*)/i)?.[1],
  );
  // A heading line: "4.2 Fees", "7. Term" or "Clause 7"; a bare "250 pounds"
  // is not one.
  for (const match of content.matchAll(
    /^\s*(?:(?:clause|section|article)\s+(\d+(?:\.\d+)*)|(\d+(?:\.\d+)+|\d+(?=\.\s)))\.?(?=\s|$)/gim,
  ))
    add(match[1] ?? match[2]);
  return found;
}

/** Keyword query matching "clause 4.2", "section 4.2", "paragraph 4.2"… */
export function clauseReferenceQuery(numbers: string[]): string {
  return numbers
    .flatMap((number) =>
      ["clause", "section", "paragraph", "article"].map(
        (word) => `"${word} ${number}"`,
      ),
    )
    .join(" or ");
}

export type AmendmentReport = {
  document_id: string;
  title: string;
  document_number: string | null;
  document_date: string | null;
  effective_from: string | null;
  signing_status: string;
  link: "confirmed" | "possible";
  link_reason?: string;
  /** Chunks shown to the model for this amendment (best matches only). */
  chunks: ChunkHit[];
  /** Short extract when the text itself is not included. */
  snippet?: string;
  /** Why the amendment ranks where it does. */
  matched_by: ("question" | "contract_clause" | "clause_number")[];
};

export type DocumentSearchResult = {
  chunks: ChunkHit[];
  amendments: AmendmentReport[];
  /** Plain statements about what could not be verified. */
  gaps: string[];
};

/**
 * Person-like names in a question: two or three capitalised words in a row
 * ("Leila Ivydale"). Searched as exact phrases, because meaning-based search
 * drowns a name among many passages about the same topic.
 */
export function namePhrases(query: string): string[] {
  const found = query.match(/\p{Lu}\p{Ll}+(?:[ ]+\p{Lu}\p{Ll}+){1,2}/gu) ?? [];
  return [...new Set(found.map((name) => name.replace(/\s+/g, " ")))].slice(
    0,
    2,
  );
}

/** Reciprocal rank fusion of the vector and the text ranking. */
export function fuseRankings(lists: ChunkHit[][], limit: number): ChunkHit[] {
  const scores = new Map<string, { score: number; hit: ChunkHit }>();
  for (const list of lists)
    list.forEach((hit, index) => {
      const entry = scores.get(hit.chunkId) ?? { score: 0, hit };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(hit.chunkId, entry);
    });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.hit);
}

export function createDocumentSearch(deps: {
  repository: RetrievalRepository;
  embedder: Embedder;
}) {
  const { repository, embedder } = deps;

  async function hybrid(
    scope: SearchScope,
    filters: DocumentFilters,
    query: string,
    limit: number,
    queryEmbedding?: number[],
  ): Promise<ChunkHit[]> {
    const embedding =
      queryEmbedding ?? (await embedder.embed([query], "query"))[0];
    const [byMeaning, byText, ...byName] = await Promise.all([
      embedding
        ? repository.vectorSearch(scope, filters, embedding, CANDIDATES)
        : Promise.resolve([]),
      repository.textSearch(scope, filters, query, CANDIDATES),
      ...namePhrases(query).map((name) =>
        repository.textSearch(scope, filters, name, NAME_HITS, "phrase"),
      ),
    ]);
    return fuseRankings([...byName, byMeaning, byText], limit);
  }

  /**
   * An amendment's text. `all` is read in full only to judge the link to the
   * contract; `best` (the passages closest to the question) is what may reach
   * the model, and `relevance` orders amendments among themselves.
   */
  async function amendmentView(
    scope: SearchScope,
    amendment: AmendmentRow,
    embedding: number[] | undefined,
    signals: { clauseHits: ChunkHit[]; referenceHits: ChunkHit[] },
  ): Promise<{
    all: ChunkHit[];
    best: ChunkHit[];
    relevance: number;
    matchedBy: AmendmentReport["matched_by"];
    gap?: string;
  }> {
    if (amendment.processingStatus !== "indexed")
      return {
        all: [],
        best: [],
        relevance: 0,
        matchedBy: [],
        gap: `Amendment "${amendment.title}" is not indexed (${amendment.processingStatus}), so its text could not be checked.`,
      };
    const all = await repository.chunksOfDocument(scope, amendment.documentId);
    if (all.length === 0)
      return {
        all: [],
        best: [],
        relevance: 0,
        matchedBy: [],
        gap: `Amendment "${amendment.title}" has no readable text.`,
      };
    const ranked = embedding
      ? await repository.vectorSearch(
          scope,
          { documentId: amendment.documentId },
          embedding,
          AMENDMENT_HITS,
        )
      : [];

    // Three signals per passage: close to the question, close to the contract
    // clause that was found, and citing that clause's number. The best of the
    // first two sets the score; a cited number adds a bonus.
    const scored = new Map<
      string,
      { hit: ChunkHit; score: number; by: Set<string> }
    >();
    const note = (
      hit: ChunkHit,
      similarity: number,
      by: AmendmentReport["matched_by"][number],
    ) => {
      const entry = scored.get(hit.chunkId) ?? {
        hit,
        score: 0,
        by: new Set<string>(),
      };
      entry.score = Math.max(entry.score, similarity);
      entry.by.add(by);
      scored.set(hit.chunkId, entry);
    };
    for (const hit of ranked) note(hit, hit.similarity ?? 0, "question");
    for (const hit of signals.clauseHits)
      note(hit, hit.similarity ?? 0, "contract_clause");
    for (const hit of signals.referenceHits) {
      const known = scored.get(hit.chunkId);
      note(hit, Math.max(known?.score ?? 0, REFERENCE_BASE), "clause_number");
      const entry = scored.get(hit.chunkId);
      if (entry) entry.score += REFERENCE_BONUS;
    }
    const ordered = [...scored.values()].sort((a, b) => b.score - a.score);
    const top = ordered.slice(0, AMENDMENT_HITS);
    const best =
      top.length > 0
        ? top.map((entry) => entry.hit)
        : all.slice(0, AMENDMENT_HITS);
    return {
      all,
      best: [...best].sort((a, b) => a.pageStart - b.pageStart),
      relevance: ordered[0]?.score ?? 0,
      matchedBy: [
        ...new Set(top.flatMap((entry) => [...entry.by])),
      ] as AmendmentReport["matched_by"],
    };
  }

  /** Does the amendment text name the contract by number? */
  function mentionsContract(
    chunks: ChunkHit[],
    contract: { documentNumber: string | null; documentDate: string | null },
  ): string | null {
    const text = chunks
      .map((chunk) => chunk.content)
      .join("\n")
      .toLowerCase();
    const number = contract.documentNumber?.toLowerCase();
    if (!number || !text.includes(number)) return null;
    if (contract.documentDate && text.includes(contract.documentDate))
      return `names contract ${contract.documentNumber} dated ${contract.documentDate}`;
    return `names contract ${contract.documentNumber}`;
  }

  /** Amendments that may change a clause of the contract behind `hit`. */
  async function verifyAmendments(
    scope: SearchScope,
    hits: ChunkHit[],
    embedding: number[] | undefined,
  ): Promise<{ amendments: AmendmentReport[]; gaps: string[] }> {
    const gaps: string[] = [];
    const reports = new Map<string, AmendmentReport>();
    const relevance = new Map<string, number>();
    const contracts = new Map<string, string>(); // contractId -> dealId

    for (const hit of hits) {
      if (!hit.dealId) continue;
      if (hit.type === "contract") contracts.set(hit.documentId, hit.dealId);
      else if (hit.type === "amendment") {
        if (hit.parentDocumentId)
          contracts.set(hit.parentDocumentId, hit.dealId);
        else
          for (const id of await repository.contractsOfDeal(scope, hit.dealId))
            contracts.set(id, hit.dealId);
      }
    }

    // A search over the whole team can touch many deals; the best-ranked
    // ones are expanded and the model is told to name the deal for the rest.
    const checked = [...contracts].slice(0, MAX_CONTRACTS);
    if (contracts.size > MAX_CONTRACTS)
      gaps.push(
        `Amendments of ${contracts.size - MAX_CONTRACTS} more contracts (other deals) were not checked. Name the deal (number or address) to check its amendments.`,
      );

    for (const [contractId, dealId] of checked) {
      const contract = await repository.contractMetadata(scope, contractId);
      if (!contract) continue;
      // Independent of the ranking: every linked amendment is looked at.
      const { linked, unlinked } = await repository.amendmentsForContract(
        scope,
        dealId,
        contractId,
      );
      const rows = [
        ...linked.map((row) => ({ row, link: "confirmed" as const })),
        ...unlinked.map((row) => ({ row, link: "possible" as const })),
      ];
      if (rows.length > MAX_AMENDMENTS)
        gaps.push(
          `${rows.length - MAX_AMENDMENTS} amendments of "${contract.title}" were not checked within the budget.`,
        );
      const considered = rows.slice(0, MAX_AMENDMENTS);

      // The contract passages the search found are the "clause" an amendment
      // may rewrite: look for amendment text close to them, and for text that
      // cites their clause numbers.
      let sources = hits
        .filter((hit) => hit.documentId === contractId)
        .slice(0, CLAUSE_SOURCES);
      // The question may match only amendments; then the clause is the
      // contract passage closest to the question.
      if (sources.length === 0 && embedding)
        sources = await repository.vectorSearch(
          scope,
          { documentId: contractId },
          embedding,
          CLAUSE_SOURCES,
        );
      const numbers = [
        ...new Set(
          sources.flatMap((hit) => clauseNumbers(hit.section, hit.content)),
        ),
      ].slice(0, MAX_CLAUSE_NUMBERS);
      const amendmentIds = new Set(considered.map(({ row }) => row.documentId));
      const [clauseHits, referenceHits] = await Promise.all([
        repository.similarToChunks(
          scope,
          sources.map((hit) => hit.chunkId),
          [...amendmentIds],
          AMENDMENT_HITS,
        ),
        numbers.length > 0
          ? repository.textSearch(
              scope,
              { documentType: "amendment", dealId },
              clauseReferenceQuery(numbers),
              CANDIDATES * 3,
            )
          : Promise.resolve([]),
      ]);
      const of = (list: ChunkHit[], documentId: string) =>
        list.filter((hit) => hit.documentId === documentId);

      for (const { row, link } of considered) {
        if (reports.has(row.documentId)) continue;
        const view = await amendmentView(scope, row, embedding, {
          clauseHits: of(clauseHits, row.documentId),
          referenceHits: of(referenceHits, row.documentId),
        });
        if (view.gap) gaps.push(view.gap);
        let reason: string | null = null;
        if (link === "possible") {
          reason = mentionsContract(view.all, contract);
          // Unlinked and not naming this contract: unrelated to it.
          if (!reason && view.all.length > 0) continue;
        }
        relevance.set(row.documentId, view.relevance);
        reports.set(row.documentId, {
          document_id: row.documentId,
          title: row.title,
          document_number: row.documentNumber,
          document_date: row.documentDate,
          effective_from: row.effectiveFrom,
          signing_status: row.status,
          link,
          ...(link === "possible"
            ? {
                link_reason:
                  reason ??
                  "not linked to a contract and its text could not be checked",
              }
            : {}),
          chunks: view.best,
          matched_by: view.matchedBy,
        });
      }
    }
    // Only the amendments closest to the question bring their text; the others
    // stay listed (status, dates, link) with a short extract. The model can
    // read one in full by searching with its document_id.
    const ordered = [...reports.values()].sort(
      (a, b) =>
        (relevance.get(b.document_id) ?? 0) -
        (relevance.get(a.document_id) ?? 0),
    );
    let omitted = 0;
    ordered.forEach((report, index) => {
      if (index < MAX_AMENDMENT_TEXTS || report.chunks.length === 0) return;
      const first = report.chunks[0];
      if (first)
        report.snippet = `${first.content.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS)}…`;
      report.chunks = [];
      omitted += 1;
    });
    if (omitted > 0)
      gaps.push(
        `The text of ${omitted} less relevant amendments is not included (only a short extract). To read one, search again with its document_id.`,
      );
    return { amendments: ordered, gaps };
  }

  return {
    hybrid,
    /** Passages for a question plus the amendment check for contract terms. */
    async search(
      scope: SearchScope,
      filters: DocumentFilters,
      query: string,
    ): Promise<DocumentSearchResult> {
      const [embedding] = await embedder.embed([query], "query");
      const chunks = await hybrid(
        scope,
        filters,
        query,
        TOP_RESULTS,
        embedding,
      );
      const gaps: string[] = [];
      const unreadable = chunks.filter((c) => c.processingStatus !== "indexed");
      if (unreadable.length > 0)
        gaps.push("Some documents shown are still being processed.");
      const { amendments, gaps: amendmentGaps } = await verifyAmendments(
        scope,
        chunks,
        embedding,
      );
      return { chunks, amendments, gaps: [...gaps, ...amendmentGaps] };
    },
  };
}
export type DocumentSearch = ReturnType<typeof createDocumentSearch>;
