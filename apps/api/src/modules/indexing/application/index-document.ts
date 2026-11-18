import { chunkPages, type PageText } from "../domain/chunking.js";
import type { ExternalTools } from "../infrastructure/external-tools.js";
import type { Embedder } from "../infrastructure/voyage.js";

export type StoredDocument = { mimeType: string; bytes: Uint8Array };
export type IndexedChunk = {
  ordinal: number;
  pageStart: number;
  pageEnd: number;
  section: string | null;
  content: string;
  embedding: number[];
};

export type IndexingStore = {
  loadDocument(documentId: string): Promise<StoredDocument | null>;
  /**
   * Replaces all chunks of the document in one transaction and marks it
   * indexed. Returns false when the document no longer exists.
   */
  replaceChunks(input: {
    documentId: string;
    model: string;
    chunks: IndexedChunk[];
    pdfRepresentation: Uint8Array | null;
  }): Promise<boolean>;
};

export type PdfText = (bytes: Uint8Array) => Promise<PageText[]>;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Pages with less text than this are treated as images and sent to OCR. */
const MIN_PAGE_TEXT = 20;

const hasText = (page: PageText) => page.text.trim().length >= MIN_PAGE_TEXT;

export function createIndexer(deps: {
  store: IndexingStore;
  tools: ExternalTools;
  extractPages: PdfText;
  embedder: Embedder;
}) {
  /** Text layer first; OCR only fills pages that have none. */
  async function readPages(pdf: Uint8Array): Promise<PageText[]> {
    const pages = await deps.extractPages(pdf);
    if (pages.every(hasText)) return pages;
    const recognised = await deps.extractPages(await deps.tools.ocr(pdf));
    return pages.map((page) => {
      if (hasText(page)) return page;
      return recognised.find((r) => r.page === page.page) ?? page;
    });
  }

  return {
    /** Returns "missing" when the document was deleted before processing. */
    async indexDocument(documentId: string): Promise<"indexed" | "missing"> {
      const document = await deps.store.loadDocument(documentId);
      if (!document) return "missing";
      const isDocx = document.mimeType === DOCX_MIME;
      const pdf = isDocx
        ? await deps.tools.docxToPdf(document.bytes)
        : document.bytes;
      const pages = await readPages(pdf);
      const chunks = chunkPages(pages);
      if (chunks.length === 0) throw new Error("No text could be extracted");
      const embeddings = await deps.embedder.embed(
        chunks.map((chunk) => chunk.content),
        "document",
      );
      const stored = await deps.store.replaceChunks({
        documentId,
        model: deps.embedder.model,
        chunks: chunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index]!,
        })),
        pdfRepresentation: isDocx ? pdf : null,
      });
      return stored ? "indexed" : "missing";
    },
  };
}
export type Indexer = ReturnType<typeof createIndexer>;
