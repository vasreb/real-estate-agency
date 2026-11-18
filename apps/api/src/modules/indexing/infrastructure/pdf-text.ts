import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageText } from "../domain/chunking.js";

/** Text layer of every page, in page order (page numbers match the file). */
export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const loading = getDocument({
    // pdf.js transfers the buffer; hand it a copy so callers keep their bytes.
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    verbosity: 0,
  });
  const document = await loading.promise;
  try {
    const pages: PageText[] = [];
    for (let page = 1; page <= document.numPages; page++) {
      const current = await document.getPage(page);
      const content = await current.getTextContent();
      let text = "";
      for (const item of content.items)
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      pages.push({ page, text });
      current.cleanup();
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}
