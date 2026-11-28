import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizePdfText } from "../src/lib/documents/text-sanitization.ts";

test("replaces invalid UTF-16 and nulls without changing valid Unicode", () => {
  const text = "caf\u00e9 e\u0301 \ud83d\ude00 \u0000 \ud800x\udc00";

  const sanitized = sanitizePdfText(text);

  assert.equal(
    sanitized,
    "caf\u00e9 e\u0301 \ud83d\ude00 \uFFFD \uFFFDx\uFFFD",
  );
  assert.equal(sanitized.length, text.length);
});
