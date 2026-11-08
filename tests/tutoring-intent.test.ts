import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectTutoringIntent,
  getTutorInstructions,
} from "../src/lib/ai/tutoring-intent.ts";

test("explicit summary requests select structured, source-grounded summaries", () => {
  for (const request of [
    "Summarize my PDF",
    "Could you summarise the chapter?",
    "Give me a summary of these notes",
  ]) {
    const intent = detectTutoringIntent(request);

    assert.equal(intent, "summary");
    const instructions = getTutorInstructions(intent);
    assert.match(instructions, /structured summary/i);
    assert.match(instructions, /only the retrieved passages/i);
    assert.match(instructions, /do not ask a follow-up question/i);
  }
});

test("explicit explain, define, compare, and list requests use direct answers", () => {
  for (const request of [
    "Explain photosynthesis",
    "Define kinetic energy",
    "Compare mitosis and meiosis",
    "List the stages of cell division",
  ]) {
    assert.equal(detectTutoringIntent(request), "direct");
  }

  const instructions = getTutorInstructions("direct");
  assert.match(instructions, /answer that request directly/i);
  assert.match(instructions, /never add a follow-up question/i);
  assert.match(instructions, /do not turn the response into a hint/i);
});

test("ordinary learning questions preserve Socratic guidance", () => {
  const intent = detectTutoringIntent(
    "Why does the left subtree contain smaller keys?",
  );
  const instructions = getTutorInstructions(intent);

  assert.equal(intent, "socratic");
  assert.match(
    instructions,
    /For ordinary learning questions, use Socratic guidance/i,
  );
  assert.match(instructions, /useful hint or leading question/i);
  assert.doesNotMatch(
    instructions,
    /The current request explicitly asks for a summary/i,
  );
});