import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const { POST } = await import("../src/app/api/chat/route.ts");

const DOCUMENT_TEXT =
  "Photosynthesis converts sunlight into chemical energy in green plants.";

interface GeminiRequest {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
}

function makeChatRequest(
  overrides: Record<string, unknown> = {},
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Explain photosynthesis",
      documentText: DOCUMENT_TEXT,
      fileName: "biology.pdf",
      pageRanges: [
        { pageNumber: 1, startChar: 0, endChar: DOCUMENT_TEXT.length },
      ],
      history: [],
      ...overrides,
    }),
  });
}

async function withApiKey<T>(
  apiKey: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = process.env.GEMINI_API_KEY;
  if (apiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = apiKey;
  }

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previous;
    }
  }
}

async function withFetch<T>(
  fetcher: typeof fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await callback();
  } finally {
    globalThis.fetch = previous;
  }
}

function makeGeminiFetch(
  reply: string,
  onChatRequest?: (request: GeminiRequest) => void,
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (url.includes("batchEmbedContents")) {
      const requestBody = JSON.parse(String(init?.body)) as {
        requests: Array<{ taskType: string }>;
      };
      return Response.json({
        embeddings: requestBody.requests.map(({ taskType }) => ({
          values:
            taskType === "RETRIEVAL_QUERY" ? [1, 0] : [0.98, 0.02],
        })),
      });
    }

    if (url.includes(":generateContent")) {
      const requestBody = JSON.parse(String(init?.body)) as GeminiRequest;
      onChatRequest?.(requestBody);
      return Response.json({
        candidates: [{ content: { parts: [{ text: reply }] } }],
      });
    }

    throw new Error("Unexpected external request in chat route test.");
  };
}

test("malformed and empty chat inputs return client errors", async () => {
  const malformedResponse = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: "{",
    }),
  );
  assert.equal(malformedResponse.status, 400);

  await withApiKey("test-key", async () => {
    const emptyMessageResponse = await POST(
      makeChatRequest({ message: "   " }),
    );
    assert.equal(emptyMessageResponse.status, 400);

    const emptyDocumentResponse = await POST(
      makeChatRequest({ documentText: "" }),
    );
    assert.equal(emptyDocumentResponse.status, 400);

    const invalidShapeResponse = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      }),
    );
    assert.equal(invalidShapeResponse.status, 400);
  });
});

test("missing Gemini API key returns 503 without making a provider request", async () => {
  await withApiKey(undefined, async () => {
    await withFetch(
      async () => {
        assert.fail("provider fetch must not run without an API key");
      },
      async () => {
        const response = await POST(makeChatRequest());
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.match(body.error, /AI services are not configured/i);
      },
    );
  });
});

test("semantic provider failure uses keyword fallback and preserves citations", async () => {
  await withApiKey("test-key", async () => {
    const response = await withFetch(
      async (input) => {
        const url = String(input);
        if (url.includes("batchEmbedContents")) {
          return new Response("provider unavailable", { status: 503 });
        }
        return Response.json({
          candidates: [
            { content: { parts: [{ text: "Photosynthesis stores light energy." }] } },
          ],
        });
      },
      () => POST(makeChatRequest()),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reply, "Photosynthesis stores light energy.");
    assert.equal(body.retrievalMode, "keyword");
    assert.match(body.warning, /embedding provider could not process/i);
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0].fileName, "biology.pdf");
    assert.deepEqual(body.sources[0].pageNumbers, [1]);
    assert.equal(body.sources[0].text, DOCUMENT_TEXT);
  });
});

test("irrelevant semantic retrieval returns no citations and forbids diagram claims", async () => {
  const documentText =
    "A distinct passage describes estuary plants and coastal habitats.";
  await withApiKey("test-key", async () => {
    let capturedRequest: GeminiRequest | undefined;
    const response = await withFetch(
      async (input, init) => {
        const url = String(input);
        if (url.includes("batchEmbedContents")) {
          const requestBody = JSON.parse(String(init?.body)) as {
            requests: Array<{ taskType: string }>;
          };
          return Response.json({
            embeddings: requestBody.requests.map(({ taskType }) => ({
              values: taskType === "RETRIEVAL_QUERY" ? [0, 1] : [1, 0],
            })),
          });
        }
        const requestBody = JSON.parse(String(init?.body)) as GeminiRequest;
        capturedRequest = requestBody;
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "The retrieved passages do not support this diagram.",
                  },
                ],
              },
            },
          ],
        });
      },
      () =>
        POST(
          makeChatRequest({
            message: "Draw a flowchart explaining orbital resonance.",
            documentText,
          }),
        ),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reply, "The retrieved passages do not support this diagram.");
    assert.equal(body.diagram, undefined);
    assert.deepEqual(body.sources, []);
    assert.equal(body.retrievalMode, "semantic");
    assert.match(capturedRequest?.systemInstruction.parts[0].text ?? "", /do not invent nodes/i);
    assert.match(
      capturedRequest?.contents.at(-1)?.parts[0].text ?? "",
      /No direct relevant passages found/i,
    );
  });
});

test("explicit intent and confusion coexist; Mermaid, history, and citations survive", async () => {
  await withApiKey("test-key", async () => {
    let capturedRequest: GeminiRequest | undefined;
    const response = await withFetch(
      makeGeminiFetch(
        "Summary: photosynthesis stores light energy.\n\n```mermaid\nflowchart TD\n  Sunlight --> ChemicalEnergy\n```",
        (request) => {
          capturedRequest = request;
        },
      ),
      () =>
        POST(
          makeChatRequest({
            message:
              "I don't understand. Summarize photosynthesis and draw a flowchart.",
            history: [
              { role: "student", text: "How is light energy used?" },
              {
                role: "tutor",
                text: "The document discusses energy conversion.",
                diagram: "flowchart TD\n  Light --> StoredEnergy",
              },
            ],
          }),
        ),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.reply, /Summary: photosynthesis stores light energy/i);
    assert.match(body.diagram, /flowchart TD/);
    assert.equal(body.sources.length, 1);
    assert.deepEqual(body.sources[0].pageNumbers, [1]);
    const instructions = capturedRequest?.systemInstruction.parts[0].text ?? "";
    assert.match(instructions, /explicitly asks for a summary/i);
    assert.match(instructions, /moderate support cues/i);
    assert.match(instructions, /keep the requested format/i);
    assert.match(
      capturedRequest?.contents[1]?.parts[0].text ?? "",
      /Previous visual explanation \(Mermaid\)/i,
    );
  });
});

test("malformed Mermaid is returned in a separable diagram field with citations", async () => {
  await withApiKey("test-key", async () => {
    const response = await withFetch(
      makeGeminiFetch(
        "The passage explains this concept.\n\n```mermaid\nflowchart TD\n  A -->\n```",
      ),
      () => POST(makeChatRequest()),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reply, "The passage explains this concept.");
    assert.match(body.diagram, /A -->/);
    assert.equal(body.sources.length, 1);
  });
});
