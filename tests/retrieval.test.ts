import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const {
  extractKeywords,
  scoreChunk,
  retrieveRelevantChunks,
  retrieveSemanticallyRelevantChunks,
  cosineSimilarity,
} = await import("../src/lib/documents/retrieval.ts");
const { chunkText } = await import("../src/lib/documents/chunker.ts");

function makeChunks(texts: string[]): { index: number; text: string; characterCount: number; start: number; end: number }[] {
  return texts.map((text, index) => ({
    index,
    text,
    characterCount: text.length,
    start: 0,
    end: text.length,
  }));
}

test("extractKeywords returns unique lowercase keywords longer than 3 chars", () => {
  const keywords = extractKeywords("Binary Search Tree binary tree");
  assert.deepEqual(keywords, ["binary", "search", "tree"]);
});

test("extractKeywords ignores short words", () => {
  const keywords = extractKeywords("what is a BST");
  assert.deepEqual(keywords, ["what"]);
});

test("extractKeywords returns empty array for all-short words", () => {
  const keywords = extractKeywords("a an the is of");
  assert.deepEqual(keywords, []);
});

test("extractKeywords deduplicates repeated words", () => {
  const keywords = extractKeywords("tree tree tree search");
  assert.deepEqual(keywords, ["tree", "search"]);
});

test("scoreChunk counts matching keywords", () => {
  const chunk = "A binary search tree keeps its keys sorted in order.";
  const keywords = extractKeywords("binary search tree");
  assert.equal(scoreChunk(chunk, keywords), 3);
});

test("scoreChunk returns 0 when no keywords match", () => {
  const chunk = "The weather is nice today.";
  const keywords = extractKeywords("binary search tree");
  assert.equal(scoreChunk(chunk, keywords), 0);
});

test("scoreChunk handles empty keyword list", () => {
  const chunk = "any text at all";
  assert.equal(scoreChunk(chunk, []), 0);
});

test("retrieveRelevantChunks returns matches sorted by score", () => {
  const chunks = makeChunks([
    "The quick brown fox jumps over the lazy dog.",
    "Binary search trees are efficient data structures.",
    "Search algorithms help find elements quickly in sorted collections.",
    "Dogs are loyal pets that enjoy playing fetch.",
  ]);

  const results = retrieveRelevantChunks(chunks, "binary search tree", 3);

  assert.ok(results.length > 0);
  // The chunk about binary search trees should score highest (3 keywords)
  assert.equal(results[0].chunk, "Binary search trees are efficient data structures.");
  assert.equal(results[0].score, 3);
  // Scores should be descending
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score);
  }
});

test("retrieveRelevantChunks returns empty array when no keywords match", () => {
  const chunks = makeChunks([
    "The weather is nice today.",
    "Dogs are loyal pets.",
  ]);

  const results = retrieveRelevantChunks(chunks, "quantum physics", 3);
  assert.deepEqual(results, []);
});

test("retrieveRelevantChunks returns empty array for empty document", () => {
  const results = retrieveRelevantChunks([], "binary search tree", 3);
  assert.deepEqual(results, []);
});

test("retrieveRelevantChunks respects maxResults limit", () => {
  const chunks = makeChunks([
    "binary search tree",
    "binary tree structure",
    "search algorithm",
    "tree data structure",
    "unrelated text here",
  ]);

  const results = retrieveRelevantChunks(chunks, "binary tree search", 2);
  assert.equal(results.length, 2);
});

test("retrieveRelevantChunks breaks ties by document position", () => {
  const chunks = makeChunks([
    "binary tree",
    "binary tree",
    "unrelated text",
  ]);

  const results = retrieveRelevantChunks(chunks, "binary tree", 3);
  assert.equal(results.length, 2);
  assert.equal(results[0].index, 0);
  assert.equal(results[1].index, 1);
});

test("retrieveRelevantChunks handles repeated keywords in question", () => {
  const chunks = makeChunks([
    "binary search tree algorithm",
    "unrelated content",
  ]);

  // "tree tree tree" should not score higher than "tree" alone
  const results = retrieveRelevantChunks(chunks, "tree tree tree", 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].score, 1);
});

test("retrieveRelevantChunks ignores short words in question", () => {
  const chunks = makeChunks([
    "binary search tree algorithm",
    "unrelated content",
  ]);

  // "is the a binary tree" - "is", "the", "a" are all <= 3 chars
  const results = retrieveRelevantChunks(chunks, "is the a binary tree", 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].score, 2); // binary + tree
});

test("chunkText integration: chunks cover whole document", () => {
  const text = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota.";
  const chunks = chunkText(text, { chunkSize: 20, chunkOverlap: 5 });

  // Every non-whitespace character should be covered by at least one chunk
  const covered = new Uint8Array(text.length);
  for (const chunk of chunks) {
    for (let i = chunk.start; i < chunk.end; i++) {
      covered[i] = 1;
    }
  }

  for (let i = 0; i < text.length; i++) {
    if (covered[i] === 0 && !/\s/.test(text[i])) {
      assert.fail(`character ${i} ("${text[i]}") is missing from every chunk`);
    }
  }
});

test("retrieval works end-to-end with chunkText output", () => {
  const documentText =
    "A binary search tree is a node-based binary tree data structure. " +
    "It has the following properties: The left subtree of a node contains " +
    "only nodes with keys lesser than the node's key. The right subtree of " +
    "a node contains only nodes with keys greater than the node's key. " +
    "The left and right subtree each must also be a binary search tree.";

  const chunks = chunkText(documentText, { chunkSize: 200, chunkOverlap: 50 });
  const results = retrieveRelevantChunks(chunks, "binary search tree properties", 3);

  assert.ok(results.length > 0, "expected at least one relevant chunk");
  assert.ok(
    results.some((r) => r.chunk.includes("properties")),
    "expected a chunk mentioning properties",
  );
});

test("semantic retrieval ranks by cosine similarity and includes page metadata", async () => {
  const chunks = chunkText(
    "Alpha material explains vectors. Beta material covers matrices.",
    { chunkSize: 35, chunkOverlap: 0 },
  );
  const embedder = async (texts: string[], taskType: string) => {
    if (taskType === "RETRIEVAL_QUERY") {
      return [[1, 0]];
    }

    return texts.map((text) =>
      text.includes("vectors") ? [0.9, 0.1] : [0.6, 0.8],
    );
  };
  const firstChunk = chunks[0];
  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "How do vectors and matrices work?",
    {
      embedder,
      model: "test-semantic-ranking-model",
      pageRanges: [
        {
          pageNumber: 4,
          startChar: firstChunk.start,
          endChar: firstChunk.end,
        },
      ],
    },
  );

  assert.equal(results[0].index, firstChunk.index);
  assert.deepEqual(results[0].pageNumbers, [4]);
  assert.ok(results[0].score > results[1].score);
});

test("semantic retrieval excludes unrelated chunks below the similarity threshold", async () => {
  const chunks = chunkText("A document chunk about botany.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY" ? [[0, 1]] : [[1, 0]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "How does orbital mechanics work?",
    { embedder, model: "test-irrelevant-query-model" },
  );

  assert.deepEqual(results, []);
});

test("semantic retrieval rejects a high cosine score without content-term corroboration", async () => {
  const chunks = chunkText(
    "A binary search tree stores keys for efficient lookup.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : [[0.55, Math.sqrt(1 - 0.55 ** 2)]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "What is the capital of France?",
    { embedder, model: "test-uncorroborated-similarity-model" },
  );

  assert.deepEqual(results, []);
});

test("semantic retrieval keeps lexically corroborated passages at the existing cutoff", async () => {
  const chunks = chunkText(
    "A binary search tree stores keys for efficient lookup.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  const embedWithScore = (score: number) => async (
    _texts: string[],
    taskType: string,
  ) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : [[score, Math.sqrt(1 - score ** 2)]];

  const atCutoff = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain binary search trees",
    {
      embedder: embedWithScore(0.35),
      model: "test-at-semantic-cutoff-model",
    },
  );
  const belowCutoff = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain binary search trees",
    {
      embedder: embedWithScore(0.349),
      model: "test-below-semantic-cutoff-model",
    },
  );

  assert.equal(atCutoff.length, 1);
  assert.ok(atCutoff[0].score >= 0.35);
  assert.deepEqual(belowCutoff, []);
});

test("document-wide summaries can use semantic passages without query-term overlap", async () => {
  const chunks = chunkText(
    "A binary search tree stores keys for efficient lookup.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY" ? [[1, 0]] : [[1, 0]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Summarize my PDF",
    {
      embedder,
      model: "test-document-summary-model",
      requireLexicalCorroboration: false,
    },
  );

  assert.equal(results.length, 1);
});

test("semantic retrieval leaves page numbers empty when source metadata is missing", async () => {
  const chunks = chunkText("A source passage about cognition.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY" ? [[1, 0]] : [[1, 0]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain cognition",
    { embedder, model: "test-missing-metadata-model" },
  );

  assert.deepEqual(results[0].pageNumbers, []);
  assert.equal(results[0].start, 0);
  assert.ok(results[0].end > results[0].start);
});

test("semantic retrieval propagates provider failures for the API to handle", async () => {
  const chunks = chunkText("A passage about retrieval.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });

  await assert.rejects(
    retrieveSemanticallyRelevantChunks(
      chunks,
      "Explain retrieval",
      {
        model: "test-provider-failure-model",
        embedder: async () => {
          throw new Error("provider unavailable");
        },
      },
    ),
    /provider unavailable/,
  );
});

test("semantic retrieval reuses document embeddings for follow-up questions", async () => {
  const chunks = chunkText("Unique reusable content about wave mechanics.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  let documentEmbeddingCalls = 0;
  let queryEmbeddingCalls = 0;
  const embedder = async (_texts: string[], taskType: string) => {
    if (taskType === "RETRIEVAL_DOCUMENT") {
      documentEmbeddingCalls++;
      return [[1, 0]];
    }

    queryEmbeddingCalls++;
    return [[1, 0]];
  };

  await retrieveSemanticallyRelevantChunks(chunks, "First question", {
    embedder,
    model: "test-cache-reuse-model",
  });
  await retrieveSemanticallyRelevantChunks(chunks, "Follow-up question", {
    embedder,
    model: "test-cache-reuse-model",
  });

  assert.equal(documentEmbeddingCalls, 1);
  assert.equal(queryEmbeddingCalls, 2);
});

test("cosine similarity rejects vectors with different dimensions", () => {
  assert.throws(() => cosineSimilarity([1, 0], [1]), RangeError);
});