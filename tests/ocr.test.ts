import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);
const { recognizeScannedPdf } = await import("../src/lib/documents/ocr.ts");

const previousKey = process.env.GEMINI_API_KEY;

function setTestKey() {
  process.env.GEMINI_API_KEY = "test-key";
}

test("OCR extracts only requested scanned pages and preserves page numbers", async () => {
  setTestKey();
  let requestBody: Record<string, unknown> | undefined;
  let requestUrl = "";
  try {
    const result = await recognizeScannedPdf(
      new Uint8Array([37, 80, 68, 70]),
      3,
      async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));
        assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key");
        return Response.json({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  pages: [{ pageNumber: 2, text: "Recognized scanned page two." }],
                }),
              }],
            },
          }],
        });
      },
      [2],
    );

    assert.match(requestUrl, /gemini-3\.8-flash:generateContent$/);
    assert.equal(result.pageTexts[0], "");
    assert.equal(result.pageTexts[1], "Recognized scanned page two.");
    assert.equal(result.pageTexts[2], "");
    assert.deepEqual(result.pageRanges, [{
      pageNumber: 2,
      startChar: 0,
      endChar: "Recognized scanned page two.".length,
    }]);
    const contents = requestBody?.contents as Array<{ parts: Array<Record<string, unknown>> }>;
    assert.match(String(contents[0].parts[0].text), /2/);
    assert.equal(
      (contents[0].parts[1].inline_data as { mime_type: string }).mime_type,
      "application/pdf",
    );
    assert.ok(
      (contents[0].parts[1].inline_data as { data: string }).data.length > 0,
      "the PDF must be base64-encoded in the inline_data part",
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR retries one transient Gemini 503 and succeeds when capacity returns", async () => {
  setTestKey();
  let calls = 0;
  try {
    const result = await recognizeScannedPdf(
      new Uint8Array([37, 80, 68, 70]),
      1,
      async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json(
            { error: { message: "Model is experiencing high demand" } },
            { status: 503 },
          );
        }
        return Response.json({
          candidates: [{
            content: {
              parts: [{ text: '{"pages":[{"pageNumber":1,"text":"Recovered after retry."}]}' }],
            },
          }],
        });
      },
    );

    assert.equal(calls, 2);
    assert.equal(result.text, "Recovered after retry.");
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR accepts a model configured with the models/ prefix", async () => {
  setTestKey();
  const previousModel = process.env.GEMINI_OCR_MODEL;
  process.env.GEMINI_OCR_MODEL = "models/gemini-3.8-flash";
  try {
    let requestUrl = "";
    await recognizeScannedPdf(
      new Uint8Array([37, 80, 68, 70]),
      1,
      async (input) => {
        requestUrl = String(input);
        return Response.json({
          candidates: [{ content: { parts: [{ text: '{"pages":[{"pageNumber":1,"text":"OCR text"}]}' }] } }],
        });
      },
    );
    assert.match(requestUrl, /\/models\/gemini-3\.8-flash:generateContent$/);
    assert.doesNotMatch(requestUrl, /models%2F/);
  } finally {
    if (previousModel === undefined) delete process.env.GEMINI_OCR_MODEL;
    else process.env.GEMINI_OCR_MODEL = previousModel;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR reports a clear configuration error when the Gemini key is missing", async () => {
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      recognizeScannedPdf(new Uint8Array([1]), 1, async () => {
        assert.fail("OCR must not call the provider without an API key");
      }),
      /Add GEMINI_API_KEY/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR reports actionable API-key errors for provider authorization failures", async () => {
  setTestKey();
  try {
    await assert.rejects(
      recognizeScannedPdf(new Uint8Array([37, 80, 68, 70]), 1, async () =>
        Response.json({ error: { message: "API key not valid" } }, { status: 403 })),
      /Gemini rejected the API key/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR reports actionable model errors when the configured model is missing", async () => {
  setTestKey();
  try {
    await assert.rejects(
      recognizeScannedPdf(new Uint8Array([37, 80, 68, 70]), 1, async () =>
        Response.json({ error: { message: "Model not found" } }, { status: 404 })),
      /configured Gemini OCR model is unavailable or has been retired/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR rejects responses that omit a requested scanned page", async () => {
  setTestKey();
  try {
    await assert.rejects(
      recognizeScannedPdf(
        new Uint8Array([37, 80, 68, 70]),
        2,
        async () => Response.json({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  pages: [{ pageNumber: 1, text: "Only the first page." }],
                }),
              }],
            },
          }],
        }),
        [1, 2],
      ),
      /unreadable page data/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
