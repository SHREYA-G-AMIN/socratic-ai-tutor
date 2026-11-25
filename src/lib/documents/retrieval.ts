import "server-only";

import { createHash } from "node:crypto";
import type { DocumentPageRange } from "@/types/document";
import type { TextChunk } from "./chunker";
import { loadDocumentEmbeddings, saveDocumentEmbeddings } from "./vector-store";
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  getGeminiEmbeddingModel,
  generateEmbeddings,
  type EmbeddingBatch,
} from "./embeddings";

const MINIMUM_SEMANTIC_SIMILARITY = 0.35;
const MINIMUM_UNCORROBORATED_SIMILARITY = 0.68;
const MAX_CACHED_DOCUMENTS = 2;
const documentEmbeddingCache = new Map<string, Promise<number[][]>>();
const NON_CONTENT_QUERY_TERMS = new Set([
  "about",
  "after",
  "also",
  "does",
  "explain",
  "before",
  "choose",
  "choosing",
  "definition",
  "compare",
  "comparison",
  "list",
  "summarize",
  "summarise",
  "summary",
  "document",
  "chapter",
  "notes",
  "describe",
  "show",
  "tell",
  "give",
  "work",
  "works",
  "happen",
  "happens",
  "mean",
  "means",
  "again",
  "further",
  "more",
  "next",
  "from",
  "have",
  "into",
  "please",
  "that",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

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
 * top-scoring passages that match query terms.
 */
export function retrieveRelevantChunks(
  chunks: TextChunk[],
  message: string,
  maxResults: number = 3,
  pageRanges: DocumentPageRange[] = [],
  options: { minimumMatches?: number } = {},
): RetrievalResult[] {
  const keywords = getContentQueryTerms(message);
  const minimumChunkMatches =
    options.minimumMatches === 0
      ? 0
      : Math.min(options.minimumMatches ?? 1, keywords.length);

  if (
    chunks.length === 0 ||
    (keywords.length === 0 && options.minimumMatches !== 0)
  ) {
    return [];
  }

  const candidates = chunks
    .map((chunk) => {
      const evidenceText = getEvidenceText(chunk.text);
      const contentTerms = new Set(getContentQueryTerms(evidenceText));
      const matchingTerms = new Set(
        keywords.filter(
          (keyword) =>
            contentTerms.has(keyword) ||
            scoreChunk(evidenceText, [keyword]) > 0,
        ),
      );

      return {
        chunk: chunk.text,
        contentTerms: matchingTerms,
        score: matchingTerms.size,
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        pageNumbers: getPageNumbers(chunk, pageRanges),
      };
    })
    .filter((result) => result.score >= minimumChunkMatches)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const completeCandidates = candidates.filter(
    (result) => keywords.length > 0 && result.score === keywords.length,
  );
  const results = (
    completeCandidates.length > 0
      ? completeCandidates
      : selectCoverageResults(candidates, keywords, maxResults).length > 0
        ? selectCoverageResults(candidates, keywords, maxResults)
        : candidates
  ).slice(0, maxResults);

  return results.map((result) => ({
    chunk: result.chunk,
    score: result.score,
    index: result.index,
    start: result.start,
    end: result.end,
    pageNumbers: result.pageNumbers,
  }));
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
    requireLexicalCorroboration?: boolean;
    minimumContentMatches?: number;
    /** Isolates durable embeddings by authenticated user and saved document. */
    cacheScope?: string;
  } = {},
): Promise<RetrievalResult[]> {
  if (chunks.length === 0 || !message.trim()) {
    return [];
  }

  const queryTerms = getContentQueryTerms(message);
  const requireLexicalCorroboration =
    options.requireLexicalCorroboration ?? true;
  const minimumChunkMatches = requireLexicalCorroboration
    ? Math.min(options.minimumContentMatches ?? 1, queryTerms.length)
    : 0;

  const embedder = options.embedder ?? generateEmbeddings;
  const model =
    options.model ??
    (embedder === generateEmbeddings
      ? getGeminiEmbeddingModel()
      : DEFAULT_GEMINI_EMBEDDING_MODEL);
  const cacheKey = createDocumentCacheKey(
    chunks.map((chunk) => chunk.text),
    model,
    options.cacheScope,
  );
  const chunkTexts = chunks.map((chunk) => chunk.text);
  const documentVectors = await getCachedDocumentEmbeddings(
    cacheKey,
    model,
    chunkTexts,
    embedder,
  );
  if (documentVectors.length !== chunks.length) {
    throw new Error(
      "The embedding provider returned an invalid document embedding count.",
    );
  }

  const [queryVector] = await embedder([message], "RETRIEVAL_QUERY");

  if (!queryVector || queryVector.length === 0) {
    throw new Error("The embedding provider returned no query embedding.");
  }

  const results = chunks
    .map((chunk, index) => {
      const documentVector = documentVectors[index];
      if (!documentVector) {
        throw new Error(
          "The embedding provider returned a missing document embedding.",
        );
      }

      return {
        chunk: chunk.text,
        contentTerms: new Set(
          getContentQueryTerms(getEvidenceText(chunk.text)),
        ),
        score: cosineSimilarity(queryVector, documentVector),
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        pageNumbers: getPageNumbers(chunk, options.pageRanges ?? []),
      };
    })
    .filter((result) => result.score >= MINIMUM_SEMANTIC_SIMILARITY)
    .sort(
      (left, right) => right.score - left.score || left.index - right.index,
    );

  const corroboratedResults = requireLexicalCorroboration
    ? results.filter(
        (result) =>
          [...result.contentTerms].filter((term) => queryTerms.includes(term))
            .length >= minimumChunkMatches,
      )
    : results;

  if (requireLexicalCorroboration && corroboratedResults.length === 0) {
    const semanticOnlyMatch = results.find(
      (result) =>
        result.score >= MINIMUM_UNCORROBORATED_SIMILARITY &&
        result.contentTerms.size >= 1,
    );
    return semanticOnlyMatch
      ? [
          {
            chunk: semanticOnlyMatch.chunk,
            score: semanticOnlyMatch.score,
            index: semanticOnlyMatch.index,
            start: semanticOnlyMatch.start,
            end: semanticOnlyMatch.end,
            pageNumbers: semanticOnlyMatch.pageNumbers,
          },
        ]
      : [];
  }

  const completeResults = corroboratedResults.filter(
    (result) =>
      queryTerms.length > 0 &&
      queryTerms.every((term) => result.contentTerms.has(term)),
  );
  const coverageSelected =
    completeResults.length > 0
      ? completeResults.slice(0, options.maxResults ?? 3)
      : selectCoverageResults(
          corroboratedResults,
          queryTerms,
          options.maxResults ?? 3,
        ).length > 0
        ? selectCoverageResults(
            corroboratedResults,
            queryTerms,
            options.maxResults ?? 3,
          )
        : corroboratedResults.slice(0, options.maxResults ?? 3);

  return coverageSelected.map((result) => ({
    chunk: result.chunk,
    score: result.score,
    index: result.index,
    start: result.start,
    end: result.end,
    pageNumbers: result.pageNumbers,
  }));
}

export function getContentQueryTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.map(normalizeContentTerm)
        ?.filter(
          (term) => term.length > 3 && !NON_CONTENT_QUERY_TERMS.has(term),
        ) ?? [],
    ),
  ];
}

function getEvidenceText(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.includes("?"))
    .join(" ");
}

function selectCoverageResults<
  T extends {
    contentTerms: Set<string>;
    score: number;
    index: number;
  },
>(results: T[], queryTerms: string[], maxResults: number): T[] {
  const remaining = [...results];
  const selected: T[] = [];
  const coveredTerms = new Set<string>();

  while (remaining.length > 0 && selected.length < maxResults) {
    remaining.sort((left, right) => {
      const leftCoverage = queryTerms.filter(
        (term) => left.contentTerms.has(term) && !coveredTerms.has(term),
      ).length;
      const rightCoverage = queryTerms.filter(
        (term) => right.contentTerms.has(term) && !coveredTerms.has(term),
      ).length;
      const leftMatchCount = queryTerms.filter((term) =>
        left.contentTerms.has(term),
      ).length;
      const rightMatchCount = queryTerms.filter((term) =>
        right.contentTerms.has(term),
      ).length;
      return (
        rightCoverage - leftCoverage ||
        rightMatchCount - leftMatchCount ||
        right.score - left.score ||
        left.index - right.index
      );
    });

    const next = remaining.shift();
    if (!next) {
      break;
    }

    const newTerms = queryTerms.filter(
      (term) => next.contentTerms.has(term) && !coveredTerms.has(term),
    );
    if (newTerms.length === 0) {
      break;
    }

    selected.push(next);
    newTerms.forEach((term) => coveredTerms.add(term));
  }

  return selected;
}

function normalizeContentTerm(term: string): string {
  if (term.length > 5 && term.endsWith("ies")) {
    return `${term.slice(0, -3)}y`;
  }
  if (term.length > 5 && term.endsWith("ices")) {
    return `${term.slice(0, -4)}ix`;
  }
  if (term.length > 5 && term.endsWith("sses")) {
    return term.slice(0, -2);
  }
  if (
    term.length > 4 &&
    term.endsWith("s") &&
    !/(?:ss|us|is|ics)$/.test(term)
  ) {
    return term.slice(0, -1);
  }
  return term;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new RangeError(
      "Embedding vectors must have the same non-zero length.",
    );
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
      (range) => chunk.start < range.endChar && chunk.end > range.startChar,
    )
    .map((range) => range.pageNumber);
}

async function getCachedDocumentEmbeddings(
  cacheKey: string,
  model: string,
  texts: string[],
  embedder: EmbeddingBatch,
): Promise<number[][]> {
  let cached = documentEmbeddingCache.get(cacheKey);

  if (cached) {
    documentEmbeddingCache.delete(cacheKey);
    documentEmbeddingCache.set(cacheKey, cached);
    return cached;
  }

  cached = (async () => {
    // Only the production Gemini embedder uses the durable store. Injected
    // test/custom embedders remain isolated and deterministic.
    if (embedder === generateEmbeddings) {
      const stored = await loadDocumentEmbeddings(cacheKey, model, texts);
      if (stored) return stored;
    }

    const vectors = await embedder(texts, "RETRIEVAL_DOCUMENT");
    if (embedder === generateEmbeddings) {
      const persisted = await saveDocumentEmbeddings(
        cacheKey,
        model,
        texts,
        vectors,
      );
      if (
        !persisted &&
        process.env.SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        console.warn(
          "[retrieval] durable vector storage unavailable; using process cache",
        );
      }
    }
    return vectors;
  })();

  documentEmbeddingCache.set(cacheKey, cached);

  while (documentEmbeddingCache.size > MAX_CACHED_DOCUMENTS) {
    const oldestKey = documentEmbeddingCache.keys().next().value;
    if (oldestKey) documentEmbeddingCache.delete(oldestKey);
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

function createDocumentCacheKey(texts: string[], model: string, scope?: string): string {
  return createHash("sha256")
    .update(scope ?? "shared")
    .update("\0")
    .update(model)
    .update("\0")
    .update(JSON.stringify(texts))
    .digest("hex");
}