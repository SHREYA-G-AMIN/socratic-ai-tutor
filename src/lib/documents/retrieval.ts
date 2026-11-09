import "server-only";

import { createHash } from "node:crypto";
import type { DocumentPageRange } from "@/types/document";
import type { TextChunk } from "./chunker";
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  getGeminiEmbeddingModel,
  generateEmbeddings,
  type EmbeddingBatch,
} from "./embeddings";

const MINIMUM_SEMANTIC_SIMILARITY = 0.35;
const MAX_CACHED_DOCUMENTS = 2;
const documentEmbeddingCache = new Map<string, Promise<number[][]>>();

/**
 * A single chunk together with its relevance score for a query.
 */
export interface RetrievalResult {
  /** The chunk text, copied verbatim from the source document. */
  chunk: string;
  /** How many unique query keywords appear in this chunk. */
  score: number;
  /** Zero-based position of the chunk in the original document. */
  index: number;
  /** Inclusive character offset in the source document. */
  start: number;
  /** Exclusive character offset in the source document. */
  end: number;
  /** One-based source PDF page numbers, if page metadata was supplied. */
  pageNumbers: number[];
}

/**
 * Splits a user message into unique, lowercase keywords.
 *
 * Short words (<= 3 characters) are ignored because they carry little
 * discriminative signal. Duplicate keywords are collapsed so that repeating
 * a word in the question does not inflate its score.
 *
 * @param message - The user's question.
 * @returns Unique keywords in the order they first appear.
 */
export function extractKeywords(message: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const word of message.toLowerCase().split(/\s+/)) {
    if (word.length > 3 && !seen.has(word)) {
      seen.add(word);
      keywords.push(word);
    }
  }

  return keywords;
}

/**
 * Counts how many unique keywords appear in a chunk.
 *
 * Matching is case-insensitive and substring-based: a keyword counts if it
 * appears anywhere inside the chunk text.
 *
 * @param chunk - The chunk text to score.
 * @param keywords - Unique keywords extracted from the user's question.
 * @returns Number of matching keywords (0 if none match).
 */
export function scoreChunk(chunk: string, keywords: string[]): number {
  const lowerChunk = chunk.toLowerCase();

  return keywords.reduce((score, keyword) => {
    return lowerChunk.includes(keyword) ? score + 1 : score;
  }, 0);
}

/**
 * Ranks document chunks by relevance to a user's question and returns the
 * top-scoring passages that actually contain matching keywords.
 *
 * Chunks are sorted by score descending, with earlier document positions
 * breaking ties. Only chunks with at least one keyword match are returned.
 *
 * @param chunks - Document chunks produced by {@link chunkText}.
 * @param message - The user's question.
 * @param maxResults - Maximum number of passages to return (default 3).
 * @returns Relevant chunks ranked by score, or an empty array when no chunk
 *   contains any keyword from the question.
 */
export function retrieveRelevantChunks(
  chunks: TextChunk[],
  message: string,
  maxResults: number = 3,
  pageRanges: DocumentPageRange[] = [],
): RetrievalResult[] {
  const keywords = extractKeywords(message);

  if (keywords.length === 0 || chunks.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => ({
      chunk: chunk.text,
      score: scoreChunk(chunk.text, keywords),
      index: chunk.index,
      start: chunk.start,
      end: chunk.end,
      pageNumbers: getPageNumbers(chunk, pageRanges),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxResults);
}

/**
 * Ranks chunks using Gemini retrieval embeddings. Document vectors are cached
 * by model and content for reuse across questions in the same server process.
 */
export async function retrieveSemanticallyRelevantChunks(
  chunks: TextChunk[],
  message: string,
  options: {
    maxResults?: number;
    pageRanges?: DocumentPageRange[];
    embedder?: EmbeddingBatch;
    model?: string;
  } = {},
): Promise<RetrievalResult[]> {
  if (chunks.length === 0 || !message.trim()) {
    return [];
  }

  const embedder = options.embedder ?? generateEmbeddings;
  const model =
    options.model ??
    (embedder === generateEmbeddings
      ? getGeminiEmbeddingModel()
      : DEFAULT_GEMINI_EMBEDDING_MODEL);
  const cacheKey = createDocumentCacheKey(
    chunks.map((chunk) => chunk.text),
    model,
  );
  const documentVectors = await getCachedDocumentEmbeddings(
    cacheKey,
    chunks.map((chunk) => chunk.text),
    embedder,
  );
  if (documentVectors.length !== chunks.length) {
    throw new Error("The embedding provider returned an invalid document embedding count.");
  }

  const [queryVector] = await embedder([message], "RETRIEVAL_QUERY");

  if (!queryVector || queryVector.length === 0) {
    throw new Error("The embedding provider returned no query embedding.");
  }

  const results = chunks
    .map((chunk, index) => {
      const documentVector = documentVectors[index];
      if (!documentVector) {
        throw new Error("The embedding provider returned a missing document embedding.");
      }

      return {
        chunk: chunk.text,
        score: cosineSimilarity(queryVector, documentVector),
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        pageNumbers: getPageNumbers(chunk, options.pageRanges ?? []),
      };
    })
    .filter((result) => result.score >= MINIMUM_SEMANTIC_SIMILARITY)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return results.slice(0, options.maxResults ?? 3);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new RangeError("Embedding vectors must have the same non-zero length.");
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index++) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new RangeError("Embedding vectors must contain finite values.");
    }

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

function getPageNumbers(
  chunk: TextChunk,
  pageRanges: DocumentPageRange[],
): number[] {
  return pageRanges
    .filter(
      (range) =>
        chunk.start < range.endChar && chunk.end > range.startChar,
    )
    .map((range) => range.pageNumber);
}

async function getCachedDocumentEmbeddings(
  cacheKey: string,
  texts: string[],
  embedder: EmbeddingBatch,
): Promise<number[][]> {
  let cached = documentEmbeddingCache.get(cacheKey);

  if (cached) {
    documentEmbeddingCache.delete(cacheKey);
    documentEmbeddingCache.set(cacheKey, cached);
    return cached;
  }

  cached = embedder(texts, "RETRIEVAL_DOCUMENT");
  documentEmbeddingCache.set(cacheKey, cached);

  while (documentEmbeddingCache.size > MAX_CACHED_DOCUMENTS) {
    const oldestKey = documentEmbeddingCache.keys().next().value;
    if (oldestKey) {
      documentEmbeddingCache.delete(oldestKey);
    }
  }

  try {
    return await cached;
  } catch (error) {
    if (documentEmbeddingCache.get(cacheKey) === cached) {
      documentEmbeddingCache.delete(cacheKey);
    }
    throw error;
  }
}

function createDocumentCacheKey(texts: string[], model: string): string {
  return createHash("sha256")
    .update(model)
    .update("\0")
    .update(JSON.stringify(texts))
    .digest("hex");
}