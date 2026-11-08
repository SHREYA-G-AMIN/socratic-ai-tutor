import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const { EmbeddingProviderError, generateEmbeddings } = await import(
  "../src/lib/documents/embeddings.ts"
);

function withApiKey<T>(apiKey: string | undefined, callback: () => Promise<T>) {
  const previous = process.env.GEMINI_API_KEY;
  if (apiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = apiKey;
  }

  return callback().finally(() => {
    if (previous === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previous;
    }
  });
}

test("generates retrieval embeddings using Gemini's batch endpoint", async () => {
  await withApiKey("test-key", async () => {
    const observed: {
      requestBody:
        | {
            requests: Array<{
              model: string;
              taskType: string;
              content: { parts: Array<{ text: string }> };
            }>;
          }
        | null;
      apiKeyHeader: string | null;
    } = { requestBody: null, apiKeyHeader: null };

    const fetcher: typeof fetch = async (_input, init) => {
      observed.requestBody = JSON.parse(String(init?.body));
      observed.apiKeyHeader = new Headers(init?.headers).get("x-goog-api-key");
      return Response.json({
        embeddings: [{ values: [0.1, 0.9] }, { values: [0.8, 0.2] }],
      });
    };

    const embeddings = await generateEmbeddings(
      ["document chunk", "student query"],
      "RETRIEVAL_QUERY",
      fetcher,
    );

    assert.deepEqual(embeddings, [
      [0.1, 0.9],
      [0.8, 0.2],
    ]);
    assert.ok(observed.requestBody);
    assert.equal(observed.apiKeyHeader, "test-key");
    assert.equal(
      observed.requestBody.requests[0].model,
      "models/gemini-embedding-001",
    );
    assert.equal(observed.requestBody.requests[0].taskType, "RETRIEVAL_QUERY");
    assert.equal(
      observed.requestBody.requests[1].content.parts[0].text,
      "student query",
    );
  });
});

test("batches document embeddings without exceeding the provider batch limit", async () => {
  await withApiKey("test-key", async () => {
    const requestSizes: number[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        requests: unknown[];
      };
      requestSizes.push(body.requests.length);
      return Response.json({
        embeddings: body.requests.map(() => ({ values: [1, 0] })),
      });
    };

    const embeddings = await generateEmbeddings(
      Array.from({ length: 101 }, (_, index) => `chunk-${index}`),
      "RETRIEVAL_DOCUMENT",
      fetcher,
    );

    assert.deepEqual(requestSizes, [100, 1]);
    assert.equal(embeddings.length, 101);
  });
});

test("reports a missing API key without making a provider request", async () => {
  await withApiKey(undefined, async () => {
    await assert.rejects(
      generateEmbeddings(["text"], "RETRIEVAL_QUERY", async () => {
        assert.fail("fetch must not run without an API key");
      }),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === "MISSING_API_KEY" &&
        !error.message.includes("test-key"),
    );
  });
});

test("surfaces provider failures without leaking response details", async () => {
  await withApiKey("sensitive-test-key", async () => {
    await assert.rejects(
      generateEmbeddings(
        ["text"],
        "RETRIEVAL_QUERY",
        async () => new Response("sensitive provider response", { status: 429 }),
      ),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === "PROVIDER_UNAVAILABLE" &&
        !error.message.includes("sensitive") &&
        !error.message.includes("sensitive-test-key"),
    );
  });
});

test("rejects malformed or non-finite provider embeddings", async () => {
  await withApiKey("test-key", async () => {
    await assert.rejects(
      generateEmbeddings(
        ["text"],
        "RETRIEVAL_DOCUMENT",
        async () =>
          Response.json({ embeddings: [{ values: [Number.NaN] }] }),
      ),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === "INVALID_RESPONSE",
    );
  });
});
