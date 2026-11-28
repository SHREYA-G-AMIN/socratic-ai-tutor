import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const {
  extractKeywords,
  scoreChunk,
  getContentQueryTerms,
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

const CPU_SCHEDULING_PASSAGES = [
  "Round Robin main example uses a time quantum of 2.",
  "Main Round Robin example process table: Process AT BT; P1 AT=0 BT=5; P2 AT=1 BT=4; P3 AT=2 BT=2.",
  "Main example execution order (Gantt chart): P1 0-2; P2 2-4; P3 4-6; P1 6-8; P2 8-10; P1 10-11.",
  "Additional Round Robin example execution order: P4 0-3; P5 3-6; P4 6-8.",
  "SJF (shortest job first) causes starvation because long processes can wait indefinitely when shorter jobs continue to arrive.",
  "Context switching incurs overhead because the operating system saves and restores process state.",
  "FCFS is a scheduling policy, but disk scheduling is not covered in these CPU scheduling notes.",
];

const CPU_SCHEDULING_SOURCE = CPU_SCHEDULING_PASSAGES.join("\n\n");
const CPU_SCHEDULING_CHUNKS = (() => {
  let start = 0;
  return CPU_SCHEDULING_PASSAGES.map((text, index) => {
    const chunk = {
      index,
      text,
      characterCount: text.length,
      start,
      end: start + text.length,
    };
    start = chunk.end + 2;
    return chunk;
  });
})();
const CPU_SCHEDULING_PAGE_RANGES = [
  {
    pageNumber: 7,
    startChar: 0,
    endChar: CPU_SCHEDULING_SOURCE.length,
  },
];

const cpuSchedulingEmbedder = async (texts: string[], taskType: string) => {
  if (taskType === "RETRIEVAL_QUERY") {
    const terms = getContentQueryTerms(texts[0]);
    if (terms.includes("memory") || terms.includes("compaction")) {
      return [[1, 0, 0, 0]];
    }
    if (terms.includes("sjf") || terms.includes("starvation")) {
      return [[0, 1, 0, 0]];
    }
    if (terms.includes("contextswitch")) return [[0, 0, 1, 0]];
    return [[1, 0, 0, 0]];
  }

  return texts.map((text) => {
    if (/\b(?:sjf|shortest job first)\b/i.test(text)) return [0, 1, 0, 0];
    if (/context[\s-]+switch/i.test(text)) return [0, 0, 1, 0];
    if (/\bfcfs\b/i.test(text)) return [0, 0, 0, 1];
    return [1, 0, 0, 0];
  });
};

async function retrieveCpuScheduling(query: string, maxResults = 3) {
  return retrieveSemanticallyRelevantChunks(
    CPU_SCHEDULING_CHUNKS,
    query,
    {
      embedder: cpuSchedulingEmbedder,
      model: "test-cpu-scheduling-retrieval-model",
      cacheScope: "cpu-scheduling-fixture",
      pageRanges: CPU_SCHEDULING_PAGE_RANGES,
      maxResults,
    },
  );
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

test("retrieveRelevantChunks rejects a weak one-term match for a multi-term question", () => {
  const chunks = makeChunks([
    "This note mentions a binary tree.",
    "The weather is nice today.",
  ]);

  const results = retrieveRelevantChunks(
    chunks,
    "Explain binary recursion algorithms",
  );

  assert.deepEqual(results, []);
});

test("retrieveRelevantChunks requires corroboration for every question topic term", () => {
  const chunks = makeChunks([
    "A binary search tree has properties that support efficient key lookup.",
  ]);

  assert.deepEqual(
    retrieveRelevantChunks(
      chunks,
      "Explain binary search tree properties and photosynthesis",
    ),
    [],
  );
});

test("retrieval ignores question-action phrasing when selecting topic evidence", () => {
  assert.deepEqual(
    getContentQueryTerms(
      "Why does a BST compare the target value with the current node before choosing a subtree?",
    ),
    ["target", "value", "current", "node", "subtree"],
  );
});

test("semantic retrieval separates the exact beginner question from its presentation instructions", async () => {
  const query =
    "Explain CPU scheduling in simple terms, as if I'm learning it for the first time. Use an everyday example to help me understand.";
  const chunks = makeChunks([
    "CPU scheduling selects the next process from the ready queue.",
  ]);
  let embeddedQuery: string | undefined;
  const embedder = async (texts: string[], taskType: string) => {
    if (taskType === "RETRIEVAL_QUERY") {
      embeddedQuery = texts[0];
      return [[1, 0]];
    }

    return texts.map(() => [1, 0]);
  };

  assert.deepEqual(getContentQueryTerms(query), ["scheduling"]);

  const results = await retrieveSemanticallyRelevantChunks(chunks, query, {
    embedder,
    model: "test-simple-terms-retrieval-model",
    cacheScope: "simple-terms-query",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk, chunks[0].text);
  assert.equal(embeddedQuery, query);
});

test("direct CPU scheduling questions keep their topic terms", () => {
  const query = "What is CPU scheduling?";
  const chunks = makeChunks([
    "CPU scheduling selects the next process from the ready queue.",
  ]);

  assert.deepEqual(getContentQueryTerms(query), ["scheduling"]);
  assert.equal(retrieveRelevantChunks(chunks, query)[0]?.chunk, chunks[0].text);
});

test("beginner-friendly presentation instructions are separated for other subjects", () => {
  const query =
    "Explain photosynthesis in simple terms, as if I'm learning it for the first time. Use an everyday example to help me understand.";
  const chunks = makeChunks([
    "Photosynthesis converts light energy into chemical energy in plants.",
  ]);

  assert.deepEqual(getContentQueryTerms(query), ["photosynthesis"]);
  assert.equal(
    retrieveRelevantChunks(chunks, query)[0]?.chunk,
    chunks[0].text,
  );
});

test("learning remains a content term in a machine-learning question", () => {
  const query = "How does machine learning improve speech recognition?";
  const chunks = makeChunks([
    "Machine learning can improve speech recognition.",
  ]);

  assert.deepEqual(getContentQueryTerms(query), [
    "machine",
    "learning",
    "improve",
    "speech",
    "recognition",
  ]);
  assert.equal(retrieveRelevantChunks(chunks, query)[0]?.chunk, chunks[0].text);
});

test("keyword retrieval does not treat a repeated question as its own evidence", () => {
  const chunks = makeChunks([
    "Question 1\nWhy does a BST compare the target value with the current node before choosing a subtree?",
    "For each node, values smaller than the node are stored in its left subtree, while values greater than the node are stored in its right subtree.",
    "To search for a target value, begin at the root. If the target equals the current node, the search succeeds. If the target is smaller, continue to the left child. If the target is larger, continue to the right child.",
  ]);

  const results = retrieveRelevantChunks(
    chunks,
    "Why does a BST compare the target value with the current node before choosing a subtree?",
  );

  assert.deepEqual(
    results.map((result) => result.chunk),
    [chunks[2].text, chunks[1].text],
  );
  assert.ok(results.every((result) => !result.chunk.includes("Question 1")));
});

test("a repeated question alone is not keyword evidence", () => {
  const chunks = makeChunks([
    "Question 1\nWhy does a BST compare the target value with the current node before choosing a subtree?",
  ]);

  assert.deepEqual(
    retrieveRelevantChunks(
      chunks,
      "Why does a BST compare the target value with the current node before choosing a subtree?",
    ),
    [],
  );
});

test("retrieveRelevantChunks does not treat a question without topic terms as a summary", () => {
  const chunks = makeChunks([
    "A binary search tree stores keys for efficient lookup.",
    "Photosynthesis converts light energy into chemical energy.",
  ]);

  assert.deepEqual(retrieveRelevantChunks(chunks, "What is it?"), []);
});

test("retrieveRelevantChunks accepts content-term corroboration for relevant questions", () => {
  const chunks = makeChunks([
    "A binary tree is used by this unrelated note.",
    "Binary search algorithms organize data to find values efficiently.",
  ]);

  const results = retrieveRelevantChunks(
    chunks,
    "Explain binary search algorithms",
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk, chunks[1].text);
  assert.equal(results[0].score, 3);
});

test("retrieveRelevantChunks returns document passages for a whole-document summary", () => {
  const chunks = makeChunks(["First topic.", "Second topic.", "Third topic.", "Fourth topic."]);

  const results = retrieveRelevantChunks(
    chunks,
    "Summarize my PDF",
    3,
    [],
    { minimumMatches: 0 },
  );

  assert.deepEqual(results.map((result) => result.chunk), [
    "First topic.",
    "Second topic.",
    "Third topic.",
  ]);
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

  const results = retrieveRelevantChunks(chunks, "binary tree", 2);
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

test("CPU scheduling retrieval finds the main Round Robin time quantum", async () => {
  const results = await retrieveCpuScheduling(
    "What is the exact time quantum in the main Round Robin example?",
  );

  assert.ok(results.some((result) => /time quantum of 2/i.test(result.chunk)));
  assert.ok(results.every((result) => result.pageNumbers.includes(7)));
});

test("CPU scheduling retrieval matches P3 arrival time to the AT table column", async () => {
  const results = await retrieveCpuScheduling("What was P3's arrival time?");
  const table = results.find((result) => result.chunk.includes("P3 AT=2 BT=2"));

  assert.ok(table);
  assert.match(table.chunk, /P3 AT=2 BT=2/);
  assert.equal(
    CPU_SCHEDULING_SOURCE.slice(table.start, table.end),
    table.chunk,
  );
});

test("CPU scheduling retrieval returns the main Round Robin process table", async () => {
  const results = await retrieveCpuScheduling(
    "Show the main Round Robin process table.",
  );

  assert.ok(
    results.some(
      (result) =>
        result.chunk.includes("P1 AT=0 BT=5") &&
        result.chunk.includes("P2 AT=1 BT=4") &&
        result.chunk.includes("P3 AT=2 BT=2"),
    ),
  );
});

test("worked-example retrieval groups adjacent main-table and execution-order chunks", async () => {
  const results = await retrieveCpuScheduling(
    "What is the execution order for the main Round Robin example?",
  );
  const retrievedText = results.map((result) => result.chunk).join("\n");

  assert.ok(results.some((result) => result.chunk.includes("P3 AT=2 BT=2")));
  assert.ok(results.some((result) => result.chunk.includes("Gantt chart")));
  assert.match(retrievedText, /P1 AT=0 BT=5/);
  assert.match(retrievedText, /P2 AT=1 BT=4/);
  assert.match(retrievedText, /P3 AT=2 BT=2/);
  assert.match(retrievedText, /time quantum of 2/i);
  assert.match(retrievedText, /P1 0-2; P2 2-4; P3 4-6; P1 6-8; P2 8-10; P1 10-11/);
  assert.ok(
    results.every(
      (result) =>
        CPU_SCHEDULING_SOURCE.slice(result.start, result.end) === result.chunk,
    ),
  );
});

test("CPU scheduling retrieval keeps the additional example separate from the main example", async () => {
  const results = await retrieveCpuScheduling(
    "What is the execution order in the additional Round Robin example?",
  );
  const retrievedText = results.map((result) => result.chunk).join("\n");

  assert.match(retrievedText, /P4 0-3; P5 3-6; P4 6-8/);
  assert.doesNotMatch(retrievedText, /P1 0-2; P2 2-4; P3 4-6/);
});

test("CPU scheduling retrieval finds the SJF starvation explanation", async () => {
  const results = await retrieveCpuScheduling(
    "Why does SJF cause starvation for long processes?",
  );

  assert.ok(
    results.some((result) =>
      /long processes can wait indefinitely when shorter jobs continue to arrive/i.test(
        result.chunk,
      ),
    ),
  );
});

test("CPU scheduling retrieval finds context-switching overhead", async () => {
  const results = await retrieveCpuScheduling(
    "Explain the context switching overhead.",
  );

  assert.ok(
    results.some((result) =>
      /Context switching incurs overhead/i.test(result.chunk),
    ),
  );
});

test("CPU scheduling retrieval supports alternative Round Robin wording", async () => {
  const results = await retrieveCpuScheduling(
    "How does a cyclic scheduler use the time-slice length?",
  );

  assert.ok(results.some((result) => /time quantum of 2/i.test(result.chunk)));
});

test("CPU scheduling retrieval declines concepts absent from the notes", async () => {
  const results = await retrieveCpuScheduling(
    "What is memory compaction?",
  );

  assert.deepEqual(results, []);
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

test("semantic retrieval rejects a high cosine score with only one weak term across passages", async () => {
  const chunks = chunkText(
    "A binary tree is mentioned, but this note covers data structures.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : [[0.55, Math.sqrt(1 - 0.55 ** 2)]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain binary recursion algorithms",
    { embedder, model: "test-weak-semantic-corroboration-model" },
  );

  assert.deepEqual(results, []);
});

test("semantic retrieval rejects partial topic coverage despite high similarity", async () => {
  const chunks = chunkText(
    "A binary search tree has properties that support efficient key lookup.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY" ? [[1, 0]] : [[1, 0]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain binary search tree properties and photosynthesis",
    { embedder, model: "test-partial-topic-coverage-model" },
  );

  assert.deepEqual(results, []);
});

test("semantic retrieval selects BST explanation instead of the repeated question", async () => {
  const chunks = makeChunks([
    "Question 1\nWhy does a BST compare the target value with the current node before choosing a subtree?",
    "To search for a target value, begin at the root. If the target equals the current node, the search succeeds. If the target is smaller, continue to the left child. If the target is larger, continue to the right child.",
    "For each node, values smaller than the node are stored in its left subtree, while values greater than the node are stored in its right subtree.",
    "Key terms: binary tree; root; node; left subtree; right subtree.",
  ]);
  const embedder = async (texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : texts.map((text) => {
          const score = text.startsWith("To search")
            ? 0.740799
            : text.startsWith("For each node")
              ? 0.6783689
              : text.startsWith("Key terms")
                ? 0.6789172
                : 1;
          return [score, Math.sqrt(1 - score ** 2)];
        });

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Why does a BST compare the target value with the current node before choosing a subtree?",
    { embedder, model: "test-repeated-question-evidence-model" },
  );

  assert.deepEqual(
    results.map((result) => result.chunk),
    [chunks[1].text, chunks[2].text],
  );
  assert.ok(!results.some((result) => result.chunk.includes("Key terms")));
});

test("a repeated question alone is not semantic evidence", async () => {
  const chunks = makeChunks([
    "Question 1\nWhy does a BST compare the target value with the current node before choosing a subtree?",
  ]);
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY" ? [[1, 0]] : [[1, 0]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Why does a BST compare the target value with the current node before choosing a subtree?",
    { embedder, model: "test-question-alone-is-not-evidence" },
  );

  assert.deepEqual(results, []);
});

test("semantic retrieval keeps exact lexical matches below the cosine cutoff", async () => {
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
    "Explain binary search tree",
    {
      embedder: embedWithScore(0.35),
      model: "test-at-semantic-cutoff-model",
    },
  );
  const belowCutoff = await retrieveSemanticallyRelevantChunks(
    chunks,
    "Explain binary search tree",
    {
      embedder: embedWithScore(0.349),
      model: "test-below-semantic-cutoff-model",
    },
  );

  assert.equal(atCutoff.length, 1);
  assert.ok(atCutoff[0].score >= 0.35);
  assert.equal(belowCutoff.length, 1);
  assert.equal(belowCutoff[0].score, 0.349);

  const partialChunks = chunkText("A binary tree supports efficient lookup.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  const partialLexicalMatch = await retrieveSemanticallyRelevantChunks(
    partialChunks,
    "Explain binary search tree",
    {
      embedder: embedWithScore(0.349),
      model: "test-below-cutoff-partial-lexical-model",
    },
  );
  assert.deepEqual(partialLexicalMatch, []);
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

test("semantic retrieval declines questions without topic terms", async () => {
  const chunks = chunkText(
    "A binary search tree stores keys for efficient lookup.",
    { chunkSize: 100, chunkOverlap: 0 },
  );
  let embeddingCalls = 0;

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "What is it?",
    {
      embedder: async () => {
        embeddingCalls++;
        return [[1, 0]];
      },
      model: "test-no-topic-terms-model",
    },
  );

  assert.deepEqual(results, []);
  assert.equal(embeddingCalls, 0);
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

test("semantic retrieval does not cache a failed query embedding", async () => {
  const chunks = chunkText("Unique content about wave mechanics.", {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  let queryEmbeddingCalls = 0;
  const embedder = async (_texts: string[], taskType: string) => {
    if (taskType === "RETRIEVAL_DOCUMENT") {
      return [[1, 0]];
    }

    queryEmbeddingCalls++;
    if (queryEmbeddingCalls === 1) {
      throw new Error("temporary provider failure");
    }
    return [[1, 0]];
  };

  await assert.rejects(
    retrieveSemanticallyRelevantChunks(chunks, "How does wave mechanics work?", {
      embedder,
      model: "test-query-cache-recovery-model",
    }),
    /temporary provider failure/,
  );
  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "How does wave mechanics work?",
    { embedder, model: "test-query-cache-recovery-model" },
  );

  assert.equal(queryEmbeddingCalls, 2);
  assert.equal(results.length, 1);
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

test("semantic retrieval matches known Round Robin synonyms lexically", async () => {
  const chunks = chunkText(
    "The document explains Round Robin scheduling with a time quantum.",
    { chunkSize: 200, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : [[0.8, 0.6]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "How does a cyclic scheduler use the time-slice length?",
    { embedder, model: "test-synonym-only-retrieval-model" },
  );

  assert.equal(results.length, 1);
  assert.match(results[0].chunk, /Round Robin scheduling with a time quantum/i);
});

test("semantic-only retrieval still rejects a weak embedding match", async () => {
  const chunks = chunkText(
    "The document explains how rapid motion changes the position of an object over time.",
    { chunkSize: 200, chunkOverlap: 0 },
  );
  const embedder = async (_texts: string[], taskType: string) =>
    taskType === "RETRIEVAL_QUERY"
      ? [[1, 0]]
      : [[0.7, Math.sqrt(1 - 0.7 ** 2)]];

  const results = await retrieveSemanticallyRelevantChunks(
    chunks,
    "How does swift travel alter an item's whereabouts?",
    { embedder, model: "test-weak-synonym-retrieval-model" },
  );

  assert.deepEqual(results, []);
});
