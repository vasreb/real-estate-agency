import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { corpus, type AuthoredDocument } from "../model.js";
import { assertEnglishSynthetic } from "../content/language-policy.js";
import { textOf } from "../content/context.js";
import { wrapText } from "./layout.js";

export async function renderPdf(
  content: AuthoredDocument,
  options: { margin?: number } = {},
) {
  assertEnglishSynthetic(textOf(content));
  const margin = options.margin ?? 56;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const bottom = 68;
  const top = 726;
  const width = pageWidth - margin * 2;
  if (margin < 36 || margin > 100 || width < 250)
    throw new Error("Impossible PDF margin.");
  const pdf = await PDFDocument.create();
  const fixed = new Date("2026-11-12T00:00:00.000Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  pdf.setTitle(content.title);
  pdf.setAuthor("Northbridge & Vale Residential - fictional archive");
  pdf.setCreator("Northbridge & Vale synthetic archive v1");
  pdf.setProducer("pdf-lib / original synthetic layout");
  pdf.setSubject(content.key);
  const regular = await pdf.embedFont(
    content.issuer === "conveyancer"
      ? StandardFonts.TimesRoman
      : StandardFonts.Helvetica,
  );
  const bold = await pdf.embedFont(
    content.issuer === "contractor"
      ? StandardFonts.CourierBold
      : content.issuer === "conveyancer"
        ? StandardFonts.TimesRomanBold
        : StandardFonts.HelveticaBold,
  );
  const ink = rgb(0.12, 0.17, 0.21);
  const accent =
    content.issuer === "contractor"
      ? rgb(0.48, 0.27, 0.12)
      : content.issuer === "surveyor"
        ? rgb(0.16, 0.28, 0.48)
        : content.issuer === "conveyancer"
          ? rgb(0.31, 0.2, 0.36)
          : rgb(0.06, 0.34, 0.34);
  const issuer = {
    agency: corpus.agency,
    contractor: "Lantern Bench | Fictional technical records",
    surveyor: "Alder Field | Fictional survey records",
    conveyancer: "Merehaven | Fictional conveyancing copies",
  }[content.issuer];
  const bounds: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  let page!: PDFPage;
  let cursor = top;
  let bodyOnPage = false;
  const wrapped = (text: string, w: number, font: PDFFont, size: number) =>
    wrapText(text, w, (value) => font.widthOfTextAtSize(value, size));
  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    cursor = top;
    bodyOnPage = false;
    page.drawText(issuer, {
      x: margin,
      y: 809,
      size: 9,
      font: bold,
      color: accent,
    });
    const titleLines = wrapped(content.title, width, bold, 14);
    if (titleLines.length > 2)
      throw new Error("PDF title exceeds reserved header.");
    titleLines.forEach((line, i) =>
      page.drawText(line, {
        x: margin,
        y: 782 - i * 18,
        size: 14,
        font: bold,
        color: ink,
      }),
    );
    page.drawLine({
      start: { x: margin, y: 744 },
      end: { x: pageWidth - margin, y: 744 },
      thickness: 1,
      color: accent,
    });
  };
  const need = (height: number) => {
    if (height > top - bottom)
      throw new Error("Unsplittable PDF block exceeds content frame.");
    if (cursor - height < bottom) newPage();
  };
  const drawLine = (
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
  ) => {
    page.drawText(text, { x, y, size, font, color: ink });
    bounds.push({
      page: pdf.getPageCount(),
      x,
      y: y - 3,
      width: font.widthOfTextAtSize(text, size),
      height: size + 4,
    });
    bodyOnPage = true;
  };
  newPage();
  for (const block of content.blocks) {
    if (block.kind === "page-break") {
      if (bodyOnPage) newPage();
      continue;
    }
    if (block.kind === "paragraph" || block.kind === "heading") {
      const heading = block.kind === "heading";
      const size = heading ? (block.level === 1 ? 14 : 11.5) : 10.5;
      const lineHeight = heading ? 17 : 15;
      const font = heading ? bold : regular;
      const lines = wrapped(block.text, width, font, size);
      if (heading) need(Math.min(3, lines.length + 1) * lineHeight + 8);
      for (const line of lines) {
        need(lineHeight + 4);
        drawLine(line, margin, cursor - size, font, size);
        cursor -= lineHeight;
      }
      cursor -= heading ? 6 : 9;
    } else if (block.kind === "table") {
      if (
        !block.columns.length ||
        block.columns.length > 6 ||
        block.rows.some((row) => row.length !== block.columns.length)
      )
        throw new Error("Malformed table dimensions.");
      const cellWidth = width / block.columns.length;
      const size = 9;
      const leading = 12;
      const padding = 6;
      const rowHeight = (cells: string[], font: PDFFont) =>
        Math.max(
          ...cells.map(
            (cell) => wrapped(cell, cellWidth - padding * 2, font, size).length,
          ),
        ) *
          leading +
        padding * 2;
      const drawRow = (cells: string[], header: boolean) => {
        const font = header ? bold : regular;
        const height = rowHeight(cells, font);
        cells.forEach((cell, col) => {
          page.drawRectangle({
            x: margin + col * cellWidth,
            y: cursor - height,
            width: cellWidth,
            height,
            color: header ? rgb(0.92, 0.95, 0.95) : rgb(1, 1, 1),
            borderColor: rgb(0.72, 0.77, 0.78),
            borderWidth: 0.4,
          });
          wrapped(cell, cellWidth - padding * 2, font, size).forEach(
            (line, lineIndex) =>
              drawLine(
                line,
                margin + col * cellWidth + padding,
                cursor - padding - size - lineIndex * leading,
                font,
                size,
              ),
          );
        });
        cursor -= height;
      };
      const headerHeight = rowHeight(block.columns, bold);
      need(
        headerHeight + (block.rows[0] ? rowHeight(block.rows[0], regular) : 0),
      );
      drawRow(block.columns, true);
      for (const row of block.rows) {
        const height = rowHeight(row, regular);
        if (height + headerHeight > top - bottom)
          throw new Error("Oversized table row cannot be split safely.");
        if (cursor - height < bottom) {
          newPage();
          drawRow(block.columns, true);
        }
        drawRow(row, false);
      }
      cursor -= 10;
    } else {
      if (!block.signatories.length)
        throw new Error("Execution panel has no signatories.");
      const lines = [
        block.state === "simulated-signed"
          ? "Simulated signature - no real signature or verification"
          : block.state === "draft"
            ? "DRAFT - not executed"
            : "UNKNOWN - execution not established",
        ...block.signatories.flatMap((s) =>
          wrapped(`${s.name} | ${s.capacity}`, width - 16, regular, 10),
        ),
      ];
      const height = lines.length * 15 + 24;
      need(height);
      page.drawRectangle({
        x: margin,
        y: cursor - height,
        width,
        height,
        borderColor: accent,
        borderWidth: 0.8,
      });
      lines.forEach((line, i) =>
        drawLine(line, margin + 8, cursor - 16 - i * 15, regular, 10),
      );
      cursor -= height + 10;
    }
  }
  if (!bodyOnPage) throw new Error("Trailing or empty PDF page.");
  pdf.getPages().forEach((p, i) => {
    p.drawText(corpus.notice, {
      x: margin,
      y: 40,
      size: 8.4,
      font: regular,
      color: accent,
    });
    p.drawText(`Page ${i + 1} of ${pdf.getPageCount()} | ${content.key}`, {
      x: margin,
      y: 24,
      size: 8,
      font: regular,
      color: ink,
    });
  });
  const bytes = await pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return { bytes, pages: pdf.getPageCount(), bounds };
}
