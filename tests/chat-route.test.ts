import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const { POST } = await import("../src/app/api/chat/route.ts");

type TestHandler = () => Promise<void>;

async function withApiKey(
  apiKey: string | undefined,
  callback: TestHandler,
): Promise<void> {
  const previous = process.env.GEMINI_API_KEY;
  if (apiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = apiKey;
  }

  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previous;
    }
  }
}

async function withFetch(
  fetcher: typeof fetch,
  callback: TestHandler,
): Promise<void> {
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;

  try {
    await callback();
  } finally {
    globalThis.fetch = previous;
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeTutorResponse(text: string): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

test("invalid JSON, malformed bodies, and empty chat inputs return 400", async () => {
  await withApiKey(undefined, async () => {
    for (const body of [
      "{",
      "null",
      JSON.stringify({ message: "", documentText: "document" }),
      JSON.stringify({ message: "question", documentText: "" }),
      JSON.stringify({ message: "  ", documentText: "document" }),
    ]) {
      const response = await POST(makeRequest(body));
      assert.equal(response.status, 400);
    }
  });
});

test("missing Gemini API key returns 503 without calling providers", async () => {
  await withApiKey(undefined, async () => {
    await withFetch(async () => {
      assert.fail("providers must not be called without an API key");
    }, async () => {
      const response = await POST(
        makeRequest({ message: "Explain photosynthesis", documentText: "Text" }),
      );

      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /GEMINI_API_KEY/);
    });
  });
});

test("empty but valid document text returns the existing empty-content contract", async () => {
  await withApiKey("test-key", async () => {
    const response = await POST(
      makeRequest({ message: "Explain photosynthesis", documentText: " \n " }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      reply: "No document content available to search.",
      sources: [],
      retrievalMode: "keyword",
    });
  });
});

test("keyword fallback keeps citations, explicit format, confusion adaptation, and history diagrams", async () => {
  await withApiKey("test-key", async () => {
    let geminiRequest: Record<string, unknown> | undefined;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        return new Response("provider unavailable", { status: 503 });
      }

      assert.match(url, /:generateContent$/);
      geminiRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return makeTutorResponse(
        "Photosynthesis captures light energy.\n\n```mermaid\nflowchart TD\n  Light --> ChemicalEnergy\n```",
      );
    }, async () => {
      const documentText =
        "Photosynthesis captures light energy and stores it as chemical energy in plants.";
      const response = await POST(
        makeRequest({
          message: "I don't understand; summarize the photosynthesis process and draw a flowchart",
          documentText,
          fileName: "biology.pdf",
          pageRanges: [{ pageNumber: 3, startChar: 0, endChar: documentText.length }],
          history: [
            { role: "student", text: "Why does photosynthesis need light?" },
            {
              role: "tutor",
              text: "Light supplies energy.",
              diagram: "flowchart TD\n  Sunlight --> Energy",
            },
          ],
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.retrievalMode, "keyword");
      assert.match(body.warning, /embedding provider/i);
      assert.equal(body.reply, "Photosynthesis captures light energy.");
      assert.equal(body.diagram, "flowchart TD\n  Light --> ChemicalEnergy");
      assert.equal(body.sources.length, 1);
      assert.equal(body.sources[0].fileName, "biology.pdf");
      assert.deepEqual(body.sources[0].pageNumbers, [3]);
      assert.ok(body.sources[0].text.includes("Photosynthesis"));

      assert.ok(geminiRequest);
      const request = geminiRequest as {
        systemInstruction: { parts: Array<{ text: string }> };
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      };
      const instructions = request.systemInstruction.parts[0].text;
      assert.match(instructions, /structured summary/i);
      assert.match(instructions, /moderate support cues/i);
      assert.match(instructions, /explicitly requested a visual explanation/i);
      assert.match(instructions, /only.*retrieved document passages/i);
      assert.match(
        request.contents[1].parts[0].text,
        /Previous visual explanation \(Mermaid\):\s*flowchart TD/,
      );
      assert.match(
        request.contents[2].parts[0].text,
        /Passage 1 \(Pages 3\)/,
      );
    });
  });
});

test("high-scoring unrelated semantic retrieval declines without Gemini or misleading citations", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(({ taskType }) => ({
            values: taskType === "RETRIEVAL_QUERY"
              ? [1, 0]
              : [0.55, Math.sqrt(1 - 0.55 ** 2)],
          })),
        });
      }

      generationRequested = true;
      return makeTutorResponse(
        "Unsupported claim.\n```mermaid\nflowchart TD\n  Unsupported --> Claim\n```",
      );
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "What is the capital of France?",
          documentText: "A binary search tree stores keys for efficient lookup.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.retrievalMode, "semantic");
      assert.deepEqual(body.sources, []);
      assert.equal(
        body.reply,
        "I couldn't find supporting information for that question in the uploaded material.",
      );
      assert.equal(body.diagram, undefined);
      assert.equal(generationRequested, false);
    });
  });
});

test("a repeated BST revision question retrieves its explanatory passages", async () => {
  await withApiKey("test-key", async () => {
    let geminiRequest: Record<string, unknown> | undefined;
    const documentText = `Data Structures: Binary Search Trees
Sample text-based PDF for testing the Socratic AI Tutor upload and extraction pipeline
1. What is a Binary Search Tree?
A Binary Search Tree (BST) is a binary tree that stores values in an ordered way. For each node, values smaller than the node are stored in its left subtree, while values greater than the node are stored in its right subtree. This ordering property makes searching, insertion, and deletion efficient when the tree is reasonably balanced.
2. Example
Suppose we insert the values 8, 3, 10, 1, 6, and 14 in that order. The root is 8. The value 3 becomes the left child of 8, and 10 becomes the right child. The value 1 goes to the left of 3, while 6 goes to the right of 3. The value 14 becomes the right child of 10.
3. Searching in a BST
To search for a target value, begin at the root. If the target equals the current node, the search succeeds. If the target is smaller, continue to the left child. If the target is larger, continue to the right child. Repeat until the value is found or the search reaches an empty child.
4. Complexity
The average time complexity of search, insertion, and deletion in a balanced BST is O(log n), where n is the number of nodes. In the worst case, an unbalanced BST can behave like a linked list, making these operations O(n).
Revision Questions
Use these questions to test whether the PDF text is extracted correctly.
Question 1
Why does a BST compare the target value with the current node before choosing a subtree?
Question 2
What values would you visit when searching for 6 in the example tree?
Question 3
Why can a BST operation take O(n) time in the worst case?
Key terms
Binary tree; root; node; left subtree; right subtree; search; insertion; deletion; balanced tree; time complexity.
`;

    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{
            taskType: string;
            content: { parts: Array<{ text: string }> };
          }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(({ taskType, content }) => {
            if (taskType === "RETRIEVAL_QUERY") {
              return { values: [1, 0] };
            }

            const text = content.parts[0].text.toLowerCase();
            if (text.includes("revision questions")) {
              return { values: [1, 0] };
            }
            if (text.startsWith("bst\nto search for a target value")) {
              return { values: [0.9, Math.sqrt(1 - 0.9 ** 2)] };
            }
            if (text.includes("values smaller than the node")) {
              const score = 0.6783689;
              return { values: [score, Math.sqrt(1 - score ** 2)] };
            }
            if (text.includes("key terms")) {
              const score = 0.6789172;
              return { values: [score, Math.sqrt(1 - score ** 2)] };
            }
            const score = 0.7199706;
            return { values: [score, Math.sqrt(1 - score ** 2)] };
          }),
        });
      }

      geminiRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return makeTutorResponse(
        "The ordering property lets the comparison direct the search to the subtree that can contain the target.",
      );
    }, async () => {
      const response = await POST(
        makeRequest({
          message:
            "Why does a BST compare the target value with the current node before choosing a subtree?",
          documentText,
          fileName: "bst_text_extraction_test.pdf",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.retrievalMode, "semantic");
      assert.match(body.reply, /ordering property/i);
      assert.ok(
        body.sources.some((source: { text: string }) =>
          source.text.includes("To search for a target value"),
        ),
      );
      assert.ok(
        body.sources.some((source: { text: string }) =>
          source.text.includes("values smaller than the node"),
        ),
      );
      assert.ok(geminiRequest);
      const request = geminiRequest as {
        systemInstruction: { parts: Array<{ text: string }> };
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      };
      assert.match(
        request.systemInstruction.parts[0].text,
        /passages jointly establish a mechanism or entail a conclusion/i,
      );
      assert.match(
        request.systemInstruction.parts[0].text,
        /do not require the document to state the cause verbatim/i,
      );
      const context = request.contents.at(-1)?.parts[0].text ?? "";
      assert.match(context, /To search for a target value/);
      assert.match(context, /values smaller than the node/);
    });
  });
});

test("a document summary falls back to document passages when semantic scores are too low", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(({ taskType }) => ({
            values: taskType === "RETRIEVAL_QUERY" ? [1, 0] : [0, 1],
          })),
        });
      }

      generationRequested = true;
      return makeTutorResponse("**Overview**\nThe document records observations.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Summarize my PDF",
          documentText: "The expedition log records dates, locations, and weather observations.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.retrievalMode, "keyword");
      assert.match(body.warning, /document-order passages/i);
      assert.equal(body.sources.length, 1);
      assert.match(body.reply, /Overview/);
      assert.equal(generationRequested, true);
    });
  });
});

test("weak keyword fallback match declines without Gemini or citations", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input) => {
      if (String(input).includes("batchEmbedContents")) {
        return new Response("provider unavailable", { status: 503 });
      }

      generationRequested = true;
      return makeTutorResponse("Unsupported response.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Explain binary recursion algorithms",
          documentText: "This note mentions a binary tree.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.sources, []);
      assert.equal(
        body.reply,
        "I couldn't find supporting information for that question in the uploaded material.",
      );
      assert.equal(body.retrievalMode, "keyword");
      assert.equal(generationRequested, false);
    });
  });
});

test("short supported follow-ups use student context, retain history, and cite retrieved context", async () => {
  await withApiKey("test-key", async () => {
    for (const followUp of ["Why?", "Explain that", "How does it work?"]) {
      let geminiRequest: Record<string, unknown> | undefined;
      let retrievalQuery = "";
      await withFetch(async (input, init) => {
        const url = String(input);
        if (url.includes("batchEmbedContents")) {
          const requestBody = JSON.parse(String(init?.body)) as {
            requests: Array<{
              taskType: string;
              content: { parts: Array<{ text: string }> };
            }>;
          };
          retrievalQuery = requestBody.requests
            .filter(({ taskType }) => taskType === "RETRIEVAL_QUERY")
            .map(({ content }) => content.parts[0].text)
            .join("");
          return Response.json({
            embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
          });
        }

        geminiRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return makeTutorResponse("The passage says light supplies energy.");
      }, async () => {
        const documentText =
          "Photosynthesis captures light energy and stores it as chemical energy in plants.";
        const previousTutorAnswer = "The process works because of moon crystals.";
        const response = await POST(
          makeRequest({
            message: followUp,
            documentText,
            history: [
              { role: "student", text: "What does photosynthesis do?" },
              { role: "tutor", text: previousTutorAnswer },
            ],
          }),
        );

        assert.equal(response.status, 200);
        const body = await response.json();
        assert.match(body.reply, /light supplies energy/i);
        assert.equal(body.sources.length, 1);
        assert.ok(geminiRequest);
        assert.match(retrievalQuery, /What does photosynthesis do\?/);
        assert.ok(retrievalQuery.includes(followUp));
        assert.doesNotMatch(retrievalQuery, /moon crystals/i);
        const request = geminiRequest as {
          systemInstruction: { parts: Array<{ text: string }> };
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        };
        assert.match(
          request.systemInstruction.parts[0].text,
          /do not treat facts recalled from conversation history as document evidence/i,
        );
        assert.equal(request.contents[0].role, "user");
        assert.match(request.contents[0].parts[0].text, /What does photosynthesis do\?/);
        assert.equal(request.contents[1].role, "model");
        assert.match(request.contents[1].parts[0].text, /moon crystals/);
        assert.match(request.contents[2].parts[0].text, /Passage 1/);
        assert.ok(request.contents[2].parts[0].text.includes(followUp));
      });
    }
  });
});

test("an unsupported follow-up does not use a prior tutor answer as retrieval evidence", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    let retrievalQuery = "";
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{
            taskType: string;
            content: { parts: Array<{ text: string }> };
          }>;
        };
        retrievalQuery = requestBody.requests
          .filter(({ taskType }) => taskType === "RETRIEVAL_QUERY")
          .map(({ content }) => content.parts[0].text)
          .join("");
        return Response.json({
          embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
        });
      }

      generationRequested = true;
      return makeTutorResponse("Unsupported answer.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Why?",
          documentText: "Photosynthesis captures light energy.",
          history: [
            { role: "student", text: "What causes photosynthesis?" },
            {
              role: "tutor",
              text: "Photosynthesis is caused by moon crystals.",
            },
          ],
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.sources, []);
      assert.equal(
        body.reply,
        "I couldn't find supporting information for that question in the uploaded material.",
      );
      assert.match(retrievalQuery, /What causes photosynthesis\?/);
      assert.doesNotMatch(retrievalQuery, /moon crystals/i);
      assert.equal(generationRequested, false);
    });
  });
});

test("partially supported multi-part questions decline without Gemini", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
        });
      }

      generationRequested = true;
      return makeTutorResponse("Unsupported additional claim.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Explain binary search tree properties and photosynthesis",
          documentText:
            "A binary search tree has properties that support efficient key lookup.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.sources, []);
      assert.equal(
        body.reply,
        "I couldn't find supporting information for that question in the uploaded material.",
      );
      assert.equal(generationRequested, false);
    });
  });
});

test("keyword fallback declines a partially supported multi-part question", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input) => {
      if (String(input).includes("batchEmbedContents")) {
        return new Response("provider unavailable", { status: 503 });
      }

      generationRequested = true;
      return makeTutorResponse("Unsupported additional claim.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Explain binary search tree properties and photosynthesis",
          documentText:
            "A binary search tree has properties that support efficient key lookup.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.sources, []);
      assert.equal(body.retrievalMode, "keyword");
      assert.equal(generationRequested, false);
    });
  });
});

test("an unrelated question with incidental term overlap declines without Gemini", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
        });
      }

      generationRequested = true;
      return makeTutorResponse("Unsupported capital claim.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "What is the capital of France?",
          documentText:
            "This note describes capital allocation within a binary search tree.",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.sources, []);
      assert.equal(
        body.reply,
        "I couldn't find supporting information for that question in the uploaded material.",
      );
      assert.equal(generationRequested, false);
    });
  });
});

test("a document summary can retrieve relevant passages without lexical overlap", async () => {
  await withApiKey("test-key", async () => {
    let generationRequested = false;
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
        });
      }

      generationRequested = true;
      return makeTutorResponse("**Overview**\nThe passage describes binary search trees.");
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "Summarize my PDF",
          documentText: "A binary search tree stores keys for efficient lookup.",
          fileName: "algorithms.pdf",
        }),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.retrievalMode, "semantic");
      assert.match(body.reply, /Overview/);
      assert.equal(body.sources.length, 1);
      assert.equal(body.sources[0].fileName, "algorithms.pdf");
      assert.equal(generationRequested, true);
    });
  });
});

test("a model-generated diagram is omitted when the student did not request one", async () => {
  await withApiKey("test-key", async () => {
    await withFetch(async (input, init) => {
      const url = String(input);
      if (url.includes("batchEmbedContents")) {
        const requestBody = JSON.parse(String(init?.body)) as {
          requests: Array<{ taskType: string }>;
        };
        return Response.json({
          embeddings: requestBody.requests.map(() => ({ values: [1, 0] })),
        });
      }

      return makeTutorResponse(
        "The passage describes plant cells.\n```mermaid\nflowchart TD\n  A --> B\n```",
      );
    }, async () => {
      const response = await POST(
        makeRequest({
          message: "What does this document say about plant cells?",
          documentText: "Plant cells contain chloroplasts.",
        }),
      );

      const body = await response.json();
      assert.equal(body.diagram, undefined);
      assert.equal(body.reply, "The passage describes plant cells.");
      assert.equal(body.sources.length, 1);
    });
  });
});