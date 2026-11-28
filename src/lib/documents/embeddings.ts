import "server-only";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
export type EmbeddingBatch = (texts: string[], taskType: EmbeddingTaskType) => Promise<number[][]>;

const GOOGLE_EMBEDDING_API =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const MAX_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TRANSIENT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 1_000;

export class EmbeddingProviderError extends Error {
  readonly code: "MISSING_API_KEY" | "PROVIDER_UNAVAILABLE" | "INVALID_RESPONSE";
  readonly httpStatus?: number;
  readonly providerStatus?: string;
  readonly providerCode?: number;

  constructor(
    code: EmbeddingProviderError["code"],
    message: string,
    diagnostics: {
      httpStatus?: number;
      providerStatus?: string;
      providerCode?: number;
    } = {},
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = code;
    this.httpStatus = diagnostics.httpStatus;
    this.providerStatus = diagnostics.providerStatus;
    this.providerCode = diagnostics.providerCode;
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

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbeddingProviderError(
      "MISSING_API_KEY",
      "Semantic retrieval is not configured. Set GEMINI_API_KEY on the server.",
    );
  }

  const model = getGeminiEmbeddingModel();
  const vectors: number[][] = [];
  let vectorDimension: number | undefined;

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + MAX_BATCH_SIZE);
    const endpoint = `${GOOGLE_EMBEDDING_API}/${encodeURIComponent(model)}:batchEmbedContents`;
    let response: Response | undefined;

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      try {
        response = await fetcher(endpoint, {
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
        });
      } catch (error) {
        const networkDiagnostics = getNetworkErrorDiagnostics(error);
        if (attempt < MAX_TRANSIENT_RETRIES) {
          console.warn("[documents/embeddings] transient network failure; retrying", {
            model,
            batchSize: batch.length,
            attempt: attempt + 1,
            ...networkDiagnostics,
          });
          await delay(DEFAULT_RETRY_DELAY_MS);
          continue;
        }

        console.error("[documents/embeddings] provider request failed", {
          model,
          batchSize: batch.length,
          attempts: attempt + 1,
          ...networkDiagnostics,
        });
        throw new EmbeddingProviderError(
          "PROVIDER_UNAVAILABLE",
          "The embedding provider could not be reached. Please try again.",
        );
      }

      if (response.ok) break;

      const providerError = await getProviderError(response);
      if (isRetryableStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
        console.warn("[documents/embeddings] transient provider failure; retrying", {
          model,
          batchSize: batch.length,
          attempt: attempt + 1,
          httpStatus: response.status,
          providerStatus: providerError.status,
          providerCode: providerError.code,
        });
        await delay(getRetryDelay(response));
        response = undefined;
        continue;
      }

      console.error("[documents/embeddings] provider request failed", {
        model,
        batchSize: batch.length,
        attempts: attempt + 1,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        providerStatus: providerError.status,
        providerCode: providerError.code,
      });
      throw new EmbeddingProviderError(
        "PROVIDER_UNAVAILABLE",
        "The embedding provider could not process the request. Please try again.",
        {
          httpStatus: response.status,
          providerStatus: providerError.status,
          providerCode: providerError.code,
        },
      );
    }

    if (!response?.ok) {
      throw new EmbeddingProviderError(
        "PROVIDER_UNAVAILABLE",
        "The embedding provider could not process the request. Please try again.",
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      console.error("[documents/embeddings] provider returned invalid JSON", {
        model,
        batchSize: batch.length,
        httpStatus: response.status,
      });
      throw new EmbeddingProviderError(
        "INVALID_RESPONSE",
        "The embedding provider returned an invalid response.",
        { httpStatus: response.status },
      );
    }

    const batchVectors = parseEmbeddingResponse(responseBody, batch.length);
    if (!batchVectors) {
      console.error("[documents/embeddings] provider returned malformed embeddings", {
        model,
        batchSize: batch.length,
        httpStatus: response.status,
      });
      throw new EmbeddingProviderError(
        "INVALID_RESPONSE",
        "The embedding provider returned an invalid response.",
        { httpStatus: response.status },
      );
    }

    for (const vector of batchVectors) {
      if (vectorDimension === undefined) {
        vectorDimension = vector.length;
      } else if (vector.length !== vectorDimension) {
        console.error("[documents/embeddings] provider returned inconsistent vector dimensions", {
          model,
          expectedDimension: vectorDimension,
          actualDimension: vector.length,
        });
        throw new EmbeddingProviderError(
          "INVALID_RESPONSE",
          "The embedding provider returned an invalid response.",
          { httpStatus: response.status },
        );
      }
      vectors.push(vector);
    }
  }

  return vectors;
}

function parseEmbeddingResponse(
  value: unknown,
  expectedCount: number,
): number[][] | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.embeddings) ||
    value.embeddings.length !== expectedCount
  ) {
    return null;
  }

  const vectors: number[][] = [];
  for (const embedding of value.embeddings) {
    if (!isRecord(embedding) || !Array.isArray(embedding.values)) {
      return null;
    }
    const vector: number[] = [];
    for (const item of embedding.values) {
      if (typeof item !== "number" || !Number.isFinite(item)) {
        return null;
      }
      vector.push(item);
    }
    if (vector.length === 0) {
      return null;
    }
    vectors.push(vector);
  }

  return vectors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function getNetworkErrorDiagnostics(
  error: unknown,
): { errorName?: string; errorCode?: string } {
  if (!isRecord(error)) return {};
  const cause = isRecord(error.cause) ? error.cause : error;
  return {
    ...(error instanceof Error ? { errorName: error.name } : {}),
    ...(typeof cause.code === "string"
      ? { errorCode: cause.code.slice(0, 40) }
      : {}),
  };
}

async function getProviderError(
  response: Response,
): Promise<{ code?: number; status?: string }> {
  try {
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.error)) return {};
    return {
      ...(typeof body.error.code === "number" ? { code: body.error.code } : {}),
      ...(typeof body.error.status === "string"
        ? { status: body.error.status.slice(0, 80) }
        : {}),
    };
  } catch {
    return {};
  }
}

function getRetryDelay(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return DEFAULT_RETRY_DELAY_MS;

  const seconds = Number(retryAfter);
  const retryAt = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(retryAt)
    ? Math.max(0, Math.min(MAX_RETRY_DELAY_MS, retryAt))
    : DEFAULT_RETRY_DELAY_MS;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const DEFAULT_GEMINI_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
