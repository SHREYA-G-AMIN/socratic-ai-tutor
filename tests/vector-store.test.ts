import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);
const { loadDocumentEmbeddings, saveDocumentEmbeddings } = await import(
  "../src/lib/documents/vector-store.ts"
);

function withSupabase<T>(callback: () => Promise<T>) {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  return callback().finally(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

test("loads only a complete, content-matching persisted embedding snapshot", async () => {
  await withSupabase(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      assert.match(String(input), /document_embeddings/);
      return Response.json([
        { chunk_index: 0, chunk_hash: hash("first chunk"), embedding: [1, 0] },
        { chunk_index: 1, chunk_hash: hash("second chunk"), embedding: [0, 1] },
      ]);
    };
    try {
      assert.deepEqual(
        await loadDocumentEmbeddings("document-hash", "gemini-embedding-001", [
          "first chunk",
          "second chunk",
        ]),
        [[1, 0], [0, 1]],
      );
      assert.equal(
        await loadDocumentEmbeddings("document-hash", "gemini-embedding-001", [
          "changed chunk",
          "second chunk",
        ]),
        null,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("saves vectors without storing source text", async () => {
  await withSupabase(async () => {
    const originalFetch = globalThis.fetch;
    let savedRows: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      savedRows = JSON.parse(String(init?.body));
      return new Response(null, { status: 201 });
    };
    try {
      const saved = await saveDocumentEmbeddings(
        "document-hash",
        "gemini-embedding-001",
        ["private source passage"],
        [[0.25, 0.75]],
      );
      assert.equal(saved, true);
      assert.equal(savedRows.length, 1);
      assert.equal(savedRows[0].chunk_hash, hash("private source passage"));
      assert.deepEqual(savedRows[0].embedding, [0.25, 0.75]);
      assert.equal("text" in savedRows[0], false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
