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
    assert.match(instructions, /retrieved (document )?passages/i);
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
  assert.match(instructions, /do not ask a follow-up question/i);
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
    /structured summary|short overview followed by key points/i,
  );
});

test("adaptive direct-answer instructions preserve an explicit summary request", () => {
  const instructions = getTutorInstructions("summary", "moderate");

  assert.match(instructions, /structured summary/i);
  assert.match(instructions, /break the supported concept into smaller ordered steps/i);
  assert.match(instructions, /keep the requested format/i);
  assert.match(instructions, /only.*retrieved document passages/i);
  assert.match(instructions, /do not ask a follow-up question/i);
});

test("adaptive instructions support the requested explanation without Socratic redirection", () => {
  const instructions = getTutorInstructions("direct", "high");

  assert.match(instructions, /explain a prerequisite only if the retrieved passages establish it/i);
  assert.match(instructions, /supportive tone/i);
  assert.match(instructions, /do not turn the response into a hint or Socratic question/i);
  assert.match(instructions, /keep the requested format/i);
});

test("adaptive direct formats remain direct for explanations, definitions, comparisons, and lists", () => {
  for (const request of [
    "Explain this process",
    "Define this term",
    "Compare these methods",
    "List the main stages",
  ]) {
    assert.equal(detectTutoringIntent(request), "direct");
  }

  const instructions = getTutorInstructions("direct", "moderate");
  assert.match(instructions, /fulfill the requested explanation, definition, comparison, or list/i);
  assert.match(instructions, /keep the requested format/i);
  assert.match(instructions, /do not ask a follow-up question/i);
});

test("adaptive explanations acknowledge missing evidence and forbid invented prerequisites or examples", () => {
  const moderateInstructions = getTutorInstructions("socratic", "moderate");
  const highInstructions = getTutorInstructions("direct", "high");

  assert.match(moderateInstructions, /do not use prior knowledge/i);
  assert.match(moderateInstructions, /example only when the retrieved passages support/i);
  assert.match(moderateInstructions, /uploaded material does not explain it/i);
  assert.match(highInstructions, /explain a prerequisite only if the retrieved passages establish it/i);
  assert.match(highInstructions, /acknowledge that limitation/i);
  assert.match(highInstructions, /do not turn the response into a hint or Socratic question/i);
});

test("strict grounding limits course-specific claims to evidence in retrieved passages", () => {
  const instructions = getTutorInstructions("direct");

  assert.match(instructions, /use only the retrieved document passages.*course-specific claims/i);
  assert.match(instructions, /do not use prior knowledge to add facts/i);
  assert.match(instructions, /uploaded material does not explain it/i);
  assert.match(instructions, /cannot find the information in the uploaded material/i);
});

test("mild confusion adapts Socratic guidance with simpler wording and a small hint", () => {
  const instructions = getTutorInstructions("socratic", "mild");

  assert.match(instructions, /simpler wording/i);
  assert.match(instructions, /small hint/i);
  assert.match(instructions, /not a diagnosis/i);
  assert.match(instructions, /let the student correct you/i);
});

test("no confusion preserves normal Socratic guidance without adaptation cues", () => {
  const instructions = getTutorInstructions("socratic", "none");

  assert.match(instructions, /use Socratic guidance/i);
  assert.doesNotMatch(instructions, /support cues in the conversation/i);
});