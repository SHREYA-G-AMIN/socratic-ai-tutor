import "server-only";

import { DocumentProcessingError } from "./errors";
import type { DocumentPageRange } from "@/types/document";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_OCR_MODEL = "gemini-3.8-flash";
const OCR_TIMEOUT_MS = 45_000;
const MAX_PROVIDER_ERROR_LENGTH = 500;

interface OcrPage {
  pageNumber: number;
  text: string;
}

interface GeminiErrorPayload {
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

/**
 * Uses Gemini PDF vision input only for pages without selectable text.
 * The PDF is sent directly as inline data and is never written to disk.
 */
export async function recognizeScannedPdf(
  bytes: Uint8Array,
  pageCount: number,
  fetcher: typeof fetch = fetch,
  pageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1),
): Promise<{ text: string; pageRanges: DocumentPageRange[]; truncated: boolean; pageTexts: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new DocumentProcessingError(
      "OCR_UNAVAILABLE",
      "Scanned PDF OCR is not configured. Add GEMINI_API_KEY to the server environment and restart the app.",
    );
  }

  // Accept both "gemini-3.8-flash" and "models/gemini-3.8-flash" in env files.
  const configuredModel = process.env.GEMINI_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
  const model = configuredModel.replace(/^models\//, "");
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new DocumentProcessingError(
      "OCR_UNAVAILABLE",
      "GEMINI_OCR_MODEL is invalid. Use a Gemini model name such as gemini-3.8-flash.",
    );
  }

  if (pageNumbers.length === 0 || pageNumbers.some(
    (pageNumber) => !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount,
  )) {
    throw new DocumentProcessingError("OCR_FAILED", "The scanned PDF page selection is invalid.");
  }

  const pdfBase64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  if (bytes.byteLength === 0 || pdfBase64.length === 0) {
    throw new DocumentProcessingError("OCR_FAILED", "The uploaded PDF data is empty. Please upload the PDF again.");
  }

  const requestBody = JSON.stringify({
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
          // The Gemini REST API uses snake_case for inline file payload fields.
          inline_data: {
            mime_type: "application/pdf",
            data: pdfBase64,
          },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  let response: Response | undefined;
  let attempts = 0;
  try {
    // Gemini can return 503 during temporary capacity spikes. Retry that
    // transient response once; do not retry quota, auth, or request errors.
    for (attempts = 1; attempts <= 2; attempts += 1) {
      response = await fetcher(
        `${GEMINI_API}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
          signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
        },
      );
      if (response.status !== 503 || attempts === 2) break;
      console.warn("[documents/ocr] Gemini is busy; retrying once", { model, attempt: attempts });
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[documents/ocr] Gemini request failed", {
      reason: timedOut ? "timeout" : error instanceof Error ? error.name : "unknown",
      model,
      attempts,
    });
    throw new DocumentProcessingError(
      "OCR_FAILED",
      timedOut
        ? "Scanned PDF OCR took too long. Try a smaller PDF or fewer scanned pages."
        : "Could not connect to the OCR service. Check your network connection and try again.",
    );
  }

  if (!response) {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service did not return a response.");
  }

  if (!response.ok) {
    const providerMessage = await readProviderError(response);
    // Log the provider's status and sanitized message. Never log request headers,
    // the API key, or the PDF contents.
    console.error("[documents/ocr] Gemini rejected OCR request", {
      status: response.status,
      model,
      pdfBytes: bytes.byteLength,
      encodedPdfCharacters: pdfBase64.length,
      attempts,
      message: redactSecret(providerMessage, apiKey).slice(0, MAX_PROVIDER_ERROR_LENGTH),
    });
    throw new DocumentProcessingError("OCR_FAILED", describeProviderFailure(response.status));
  }

  let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try {
    payload = await response.json();
  } catch {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned an invalid response.");
  }

  const output = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!output) {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned no readable text.");
  }

  let pages: OcrPage[];
  try {
    const parsed: unknown = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { pages?: unknown }).pages)) {
      throw new Error("Missing pages");
    }
    pages = (parsed as { pages: unknown[] }).pages
      .filter((page): page is OcrPage =>
        !!page &&
        typeof page === "object" &&
        Number.isInteger((page as OcrPage).pageNumber) &&
        (page as OcrPage).pageNumber >= 1 &&
        (page as OcrPage).pageNumber <= pageCount &&
        pageNumbers.includes((page as OcrPage).pageNumber) &&
        typeof (page as OcrPage).text === "string")
      .sort((left, right) => left.pageNumber - right.pageNumber);

    const returnedPages = new Set(pages.map((page) => page.pageNumber));
    if (pageNumbers.some((pageNumber) => !returnedPages.has(pageNumber))) {
      throw new Error("OCR response omitted one or more requested pages");
    }
  } catch {
    throw new DocumentProcessingError("OCR_FAILED", "The OCR service returned unreadable page data.");
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

async function readProviderError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as GeminiErrorPayload;
    return payload.error?.message || payload.error?.status || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function redactSecret(message: string, apiKey: string): string {
  return message.replaceAll(apiKey, "[REDACTED]").replace(/[\r\n\t]+/g, " ").trim();
}

function describeProviderFailure(status: number): string {
  if (status === 400) {
    return "Gemini rejected the OCR request. Check that GEMINI_OCR_MODEL is supported for PDF input and that the request is valid.";
  }
  if (status === 401 || status === 403) {
    return "Gemini rejected the API key. Check that GEMINI_API_KEY is valid and that the Gemini API is enabled for its project.";
  }
  if (status === 404) {
    return "The configured Gemini OCR model is unavailable or has been retired. Set GEMINI_OCR_MODEL to a currently supported model, such as gemini-3.8-flash.";
  }
  if (status === 429) {
    return "Gemini OCR quota or rate limit was reached. Wait briefly and try again.";
  }
  if (status >= 500) {
    return "Gemini OCR is temporarily unavailable. Please try again shortly.";
  }
  return `Gemini OCR request failed (HTTP ${status}). Check the server logs for provider details.`;
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
