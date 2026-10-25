import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const {
  extractKeywords,
  scoreChunk,
  retrieveRelevantChunks,
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