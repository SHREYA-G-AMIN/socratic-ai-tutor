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