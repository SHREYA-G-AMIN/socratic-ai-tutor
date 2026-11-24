import "server-only";
import { createWorker } from "tesseract.js";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { DocumentProcessingError } from "./errors";
import type { DocumentPageRange } from "@/types/document";

const MAX_OCR_CHARACTERS = 500_000;
const MAX_LOCAL_OCR_PAGES = 20;

/** Rasterizes selected PDF pages in memory and recognizes them with local Tesseract. */
export async function recognizeScannedPdfLocally(
  document: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageCount: number,
  pageNumbers: number[],
): Promise<{ text: string; pageRanges: DocumentPageRange[]; truncated: boolean; pageTexts: string[] }> {
  if (pageNumbers.length === 0 || pageNumbers.some(
    (n) => !Number.isInteger(n) || n < 1 || n > pageCount,
  )) {
    throw new DocumentProcessingError("OCR_FAILED", "The scanned PDF page selection is invalid.");
  }

  if (pageNumbers.length > MAX_LOCAL_OCR_PAGES) {
    throw new DocumentProcessingError("OCR_FAILED", "Gemini is unavailable and local OCR is limited to 20 scanned pages per upload. Split the PDF into smaller files and try again.");
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker("eng");
    const pageTexts = Array.from({ length: pageCount }, () => "");
    for (const pageNumber of pageNumbers) {
      const image = await renderPageAsImage(document, pageNumber, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 2,
      });
      // unpdf returns an ArrayBuffer; Tesseract's Node API expects a Buffer/ImageLike.
      const result = await worker.recognize(Buffer.from(image));
      pageTexts[pageNumber - 1] = result.data.text;
    }
    return joinPages(pageTexts);
  } catch (error) {
    console.error("[documents/ocr] Local Tesseract OCR failed", {
      reason: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
    throw new DocumentProcessingError(
      "OCR_FAILED",
      "Both Gemini OCR and local OCR were unavailable. Check your network connection for the initial Tesseract language-model download, then try again.",
    );
  } finally {
    await worker?.terminate();
  }
}

function joinPages(pageTexts: string[]): {
  text: string; pageRanges: DocumentPageRange[]; truncated: boolean; pageTexts: string[];
} {
  let text = "";
  let truncated = false;
  const pageRanges: DocumentPageRange[] = [];
  for (const [index, raw] of pageTexts.entries()) {
    const pageText = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!pageText) continue;
    const separator = text ? "\n\n" : "";
    const startChar = text.length + separator.length;
    const remaining = MAX_OCR_CHARACTERS - startChar;
    if (remaining <= 0) { truncated = true; break; }
    const content = pageText.slice(0, remaining);
    text += separator + content;
    pageRanges.push({ pageNumber: index + 1, startChar, endChar: startChar + content.length });
    if (content.length < pageText.length) { truncated = true; break; }
  }
  if (!text) {
    throw new DocumentProcessingError("NO_TEXT_CONTENT", "Local OCR could not recognize readable text in the scanned PDF.");
  }
  return { text, pageRanges, truncated, pageTexts };
}
