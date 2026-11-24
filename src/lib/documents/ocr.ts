import "server-only";

import { DocumentProcessingError } from "./errors";
import type { DocumentPageRange } from "@/types/document";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_OCR_MODEL = "gemini-2.5-flash";
const OCR_TIMEOUT_MS = 60_000;

interface OcrPage {
  pageNumber: number;
  text: string;
}

/**
 * Uses Gemini's PDF vision input only when PDF.js finds no selectable text.
 * The provider receives the PDF bytes directly; no temporary file is created.
 */
export async function recognizeScannedPdf(
  bytes: Uint8Array,
  pageCount: number,
  fetcher: typeof fetch = fetch,
  pageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1),
): Promise<{ text: string; pageRanges: DocumentPageRange[]; truncated: boolean; pageTexts: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new DocumentProcessingError(
      "OCR_UNAVAILABLE",
      "This PDF appears to be scanned. Set GEMINI_API_KEY on the server to enable OCR.",
      503,
    );
  }

  const model = process.env.GEMINI_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
  let response: Response;
  try {
    response = await fetcher(
      `${GEMINI_API}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              {
                text: [
                  "Perform OCR on the specified scanned PDF pages only.",
                  `Transcribe these one-based page numbers: ${pageNumbers.join(", ")}.`,
                  "Preserve headings, paragraphs, lists, equations, and meaningful line breaks.",
                  "Do not summarize, explain, infer missing text, or add commentary.",
                  "Return only valid JSON in this shape:",
                  '{"pages":[{"pageNumber":1,"text":"transcribed page text"}]}',
                  `The PDF has ${pageCount} pages. Return one entry for each requested page number only.`,
                ].join("\n"),
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: Buffer.from(bytes).toString("base64"),
                },
              },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        }),
        signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      },
    );
  } catch {
    throw new DocumentProcessingError(
      "OCR_FAILED",
      "OCR could not process this scanned PDF. Please try a clearer or smaller PDF.",
      502,
    );
  }

  if (!response.ok) {
    throw new DocumentProcessingError(
      "OCR_FAILED",
      "The OCR service could not process this PDF. Please try again later.",
      502,
    );
  }

  let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try {
    payload = await response.json();
  } catch {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned an invalid response.", 502);
  }

  const output = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!output) {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned no readable text.", 502);
  }

  let pages: OcrPage[];
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { pages?: unknown }).pages)
    ) {
      throw new Error("Missing pages");
    }
    pages = (parsed as { pages: unknown[] }).pages
      .filter((page): page is OcrPage =>
        !!page &&
        typeof page === "object" &&
        Number.isInteger((page as OcrPage).pageNumber) &&
        (page as OcrPage).pageNumber >= 1 &&
        (page as OcrPage).pageNumber <= pageCount &&
        typeof (page as OcrPage).text === "string",
      )
      .sort((left, right) => left.pageNumber - right.pageNumber);
  } catch {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned unreadable page data.", 502);
  }

  const normalizedPages = Array.from({ length: pageCount }, (_, index) => {
    const page = pages.find((item) => item.pageNumber === index + 1);
    return page?.text ?? "";
  });
  const joined = joinOcrPages(normalizedPages);
  if (!joined.text) {
    throw new DocumentProcessingError(
      "NO_TEXT_CONTENT",
      "No readable text could be recognized in this scanned PDF.",
    );
  }
  return { ...joined, pageTexts: normalizedPages };
}

function joinOcrPages(pageTexts: string[]): {
  text: string;
  pageRanges: DocumentPageRange[];
  truncated: boolean;
} {
  const maxCharacters = 500_000;
  let text = "";
  let truncated = false;
  const pageRanges: DocumentPageRange[] = [];

  for (const [index, raw] of pageTexts.entries()) {
    const pageText = raw
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!pageText) continue;

    const separator = text ? "\n\n" : "";
    const startChar = text.length + separator.length;
    const remaining = maxCharacters - startChar;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const content = pageText.slice(0, remaining);
    text += separator + content;
    pageRanges.push({
      pageNumber: index + 1,
      startChar,
      endChar: startChar + content.length,
    });
    if (content.length < pageText.length) {
      truncated = true;
      break;
    }
  }

  return { text, pageRanges, truncated };
}
