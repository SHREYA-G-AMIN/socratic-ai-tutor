import { NextResponse } from "next/server";
import { EmbeddingProviderError } from "@/lib/documents/embeddings";
import { chunkText } from "@/lib/documents/chunker";
import {
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
} from "@/lib/documents/constants";
import {
  retrieveRelevantChunks,
  retrieveSemanticallyRelevantChunks,
  type RetrievalResult,
} from "@/lib/documents/retrieval";
import type { DocumentPageRange } from "@/types/document";
import type { ChatResponse, ChatSourceReference } from "@/types/chat";

const MAX_RETRIEVED_CHUNKS = 3;
const MAX_MESSAGE_LENGTH = 2_000;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { message, documentText } = body;
    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > MAX_MESSAGE_LENGTH ||
      typeof documentText !== "string" ||
      documentText.length === 0 ||
      documentText.length > MAX_EXTRACTED_CHARACTERS
    ) {
      return NextResponse.json(
        { error: "A valid message and document text are required" },
        { status: 400 },
      );
    }

    const chunks = chunkText(documentText, {
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    if (chunks.length === 0) {
      return NextResponse.json({
        reply: "No document content available to search.",
        sources: [],
        retrievalMode: "keyword",
      } satisfies ChatResponse);
    }

    const pageRanges = parsePageRanges(body.pageRanges, documentText.length);
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim().slice(0, 255)
        : null;

    let retrievalMode: ChatResponse["retrievalMode"] = "semantic";
    let warning: string | undefined;
    let relevant: RetrievalResult[];

    try {
      relevant = await retrieveSemanticallyRelevantChunks(
        chunks,
        message.trim(),
        {
          maxResults: MAX_RETRIEVED_CHUNKS,
          pageRanges,
        },
      );
    } catch (error) {
      retrievalMode = "keyword";
      warning =
        error instanceof EmbeddingProviderError
          ? error.message
          : "Semantic retrieval is unavailable. Showing keyword matches instead.";
      console.error(
        "[api/chat] semantic retrieval unavailable; using keyword fallback",
        error instanceof EmbeddingProviderError ? error.code : "UNKNOWN_ERROR",
      );
      relevant = retrieveRelevantChunks(
        chunks,
        message.trim(),
        MAX_RETRIEVED_CHUNKS,
        pageRanges,
      );
    }

    const reply =
      relevant.length === 0
        ? `Question: "${message.trim()}"\n\nCould not find any relevant passages in the document for your question. Try rephrasing or asking about a different topic.`
        : `Question: "${message.trim()}"\n\n${relevant
            .map((result, index) => `Passage ${index + 1}: "${result.chunk}"`)
            .join("\n\n")}`;
    const sources: ChatSourceReference[] = relevant.map((result) => ({
      fileName,
      chunkIndex: result.index,
      startChar: result.start,
      endChar: result.end,
      pageNumbers: result.pageNumbers,
      text: result.chunk,
      score: result.score,
    }));

    return NextResponse.json({
      reply,
      sources,
      retrievalMode,
      ...(warning ? { warning } : {}),
    } satisfies ChatResponse);
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePageRanges(
  value: unknown,
  documentLength: number,
): DocumentPageRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_PDF_PAGES)
    .filter(
      (range): range is DocumentPageRange =>
        isRecord(range) &&
        typeof range.pageNumber === "number" &&
        Number.isInteger(range.pageNumber) &&
        range.pageNumber >= 1 &&
        range.pageNumber <= MAX_PDF_PAGES &&
        typeof range.startChar === "number" &&
        Number.isInteger(range.startChar) &&
        range.startChar >= 0 &&
        typeof range.endChar === "number" &&
        Number.isInteger(range.endChar) &&
        range.endChar > range.startChar &&
        range.endChar <= documentLength,
    )
    .map((range) => ({
      pageNumber: range.pageNumber,
      startChar: range.startChar,
      endChar: range.endChar,
    }));
}
