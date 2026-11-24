import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);
const { recognizeScannedPdf } = await import("../src/lib/documents/ocr.ts");

test("OCR extracts only requested scanned pages and preserves page numbers", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let requestBody: Record<string, unknown> | undefined;
  try {
    const result = await recognizeScannedPdf(
      new Uint8Array([37, 80, 68, 70]),
      3,
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
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
      (contents[0].parts[1].inlineData as { mimeType: string }).mimeType,
      "application/pdf",
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR reports a clear configuration error when the Gemini key is missing", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      recognizeScannedPdf(new Uint8Array([1]), 1, async () => {
        assert.fail("OCR must not call the provider without an API key");
      }),
      /Set GEMINI_API_KEY/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("OCR rejects responses that omit a requested scanned page", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
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
