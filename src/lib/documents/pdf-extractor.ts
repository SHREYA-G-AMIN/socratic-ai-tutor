import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import {
  EXTRACTION_TIMEOUT_MS,
  MAX_EXTRACTED_CHARACTERS,
  MAX_IMAGE_SIZE,
  MAX_PDF_PAGES,
} from "./constants";
import { DocumentProcessingError } from "./errors";

export interface PdfExtraction {
  /** Extracted text, whitespace-normalised and length-capped. */
  text: string;
  /** Number of characters in `text`. */
  characterCount: number;
  /** Number of pages in the document, or null when the parser cannot tell. */
  pageCount: number | null;
  /** True when the extracted text was cut off at the response limit. */
  truncated: boolean;
}

/**
 * Extracts the readable text of a PDF.
 *
 * The work is delegated to `unpdf`, a thin wrapper around Mozilla's PDF.js
 * that runs entirely on the server. Nothing from the uploaded document is
 * written to disk, and the buffer is released as soon as this function
 * returns.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtraction> {
  const document = await openDocument(bytes);

  try {
    const pageCount = document.numPages;

    if (pageCount > MAX_PDF_PAGES) {
      throw new DocumentProcessingError(
        "TOO_MANY_PAGES",
        `This document has ${pageCount} pages. The limit is ${MAX_PDF_PAGES} pages per upload.`,
      );
    }

    const { text } = await withTimeout(
      extractText(document, { mergePages: true }),
      EXTRACTION_TIMEOUT_MS,
      "Text extraction took too long and was stopped.",
    );

    const normalized = normalizeText(text);

    if (normalized.length === 0) {
      throw new DocumentProcessingError(
        "NO_TEXT_CONTENT",
        "No readable text was found in this PDF. It is most likely a scanned document, which needs OCR before it can be used.",
      );
    }

    const truncated = normalized.length > MAX_EXTRACTED_CHARACTERS;
    const finalText = truncated
      ? normalized.slice(0, MAX_EXTRACTED_CHARACTERS)
      : normalized;

    return {
      text: finalText,
      characterCount: finalText.length,
      pageCount,
      truncated,
    };
  } finally {
    await document.loadingTask.destroy();
  }
}

/**
 * Opens the PDF and turns any parser failure into a client-facing error.
 */
async function openDocument(bytes: Uint8Array) {
  try {
    return await getDocumentProxy(bytes, { maxImageSize: MAX_IMAGE_SIZE });
  } catch (error) {
    if (isPasswordError(error)) {
      throw new DocumentProcessingError(
        "PDF_PARSE_FAILED",
        "This PDF is password protected. Please upload an unprotected copy.",
      );
    }

    throw new DocumentProcessingError(
      "PDF_PARSE_FAILED",
      "The uploaded file could not be read as a PDF. It may be corrupted or incomplete.",
    );
  }
}

/**
 * PDF.js raises a `PasswordException` when a document needs a password.
 */
function isPasswordError(error: unknown): boolean {
  return error instanceof Error && error.name === "PasswordException";
}

/**
 * Rejects a promise that does not settle within the given time budget.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(new DocumentProcessingError("EXTRACTION_FAILED", message)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Tidies up the raw text that PDF.js returns.
 *
 * PDF text is a stream of positioned fragments, so it commonly contains
 * Windows line endings, soft hyphens, non-breaking spaces and long runs of
 * blank lines left behind by page breaks. Cleaning these up gives the tutor
 * (and later the chunking step) a predictable string to work with.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
