import "server-only";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
export type EmbeddingBatch = (texts: string[], taskType: EmbeddingTaskType) => Promise<number[][]>;

const GOOGLE_EMBEDDING_API =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const MAX_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;

interface GoogleEmbeddingResponse {
  embeddings?: Array<{
    values?: number[];
  }>;
}

export class EmbeddingProviderError extends Error {
  readonly code: "MISSING_API_KEY" | "PROVIDER_UNAVAILABLE" | "INVALID_RESPONSE";

  constructor(
    code: EmbeddingProviderError["code"],
    message: string,
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = code;
  }
}

export function getGeminiEmbeddingModel(): string {
  return (
    process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL
  );
}

/**
 * Generates Gemini embeddings on the server. Provider response bodies and
 * credentials are deliberately excluded from errors returned to callers.
 */
export async function generateEmbeddings(
  texts: string[],
  taskType: EmbeddingTaskType,
  fetcher: typeof fetch = fetch,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new EmbeddingProviderError(
      "MISSING_API_KEY",
      "Semantic retrieval is not configured. Set GEMINI_API_KEY on the server.",
    );
  }

  const model = getGeminiEmbeddingModel();
  const vectors: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + MAX_BATCH_SIZE);
    let response: Response;

    try {
      response = await fetcher(
        `${GOOGLE_EMBEDDING_API}/${encodeURIComponent(model)}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
              taskType,
            })),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new EmbeddingProviderError(
        "PROVIDER_UNAVAILABLE",
        "The embedding provider could not be reached. Please try again.",
      );
    }

    if (!response.ok) {
      throw new EmbeddingProviderError(
        "PROVIDER_UNAVAILABLE",
        "The embedding provider could not process the request. Please try again.",
      );
    }

    let result: GoogleEmbeddingResponse;
    try {
      result = (await response.json()) as GoogleEmbeddingResponse;
    } catch {
      throw new EmbeddingProviderError(
        "INVALID_RESPONSE",
        "The embedding provider returned an invalid response.",
      );
    }

    const batchVectors = result.embeddings?.map((embedding) => embedding.values);
    if (!batchVectors || batchVectors.length !== batch.length) {
      throw new EmbeddingProviderError(
        "INVALID_RESPONSE",
        "The embedding provider returned an invalid response.",
      );
    }

    for (const vector of batchVectors) {
      if (
        !vector ||
        vector.length === 0 ||
        vector.some((value) => !Number.isFinite(value))
      ) {
        throw new EmbeddingProviderError(
          "INVALID_RESPONSE",
          "The embedding provider returned an invalid response.",
        );
      }

      vectors.push(vector);
    }
  }

  return vectors;
}

export const DEFAULT_GEMINI_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
