import { test } from "node:test";
import assert from "node:assert/strict";

import { detectConfusion } from "../src/lib/ai/confusion-detection.ts";

test("ordinary questions without confusion cues have no confusion signal", () => {
  assert.deepEqual(detectConfusion("Why does this reaction happen?"), {
    severity: "none",
    signals: [],
  });
});

test("requests for simpler wording are classified as mild", () => {
  const assessment = detectConfusion("Could you explain that more simply?");

  assert.equal(assessment.severity, "mild");
  assert.ok(assessment.signals.includes("simplification-request"));
});

test("explicit confusion is classified as moderate", () => {
  const assessment = detectConfusion("I don't understand this step.");

  assert.equal(assessment.severity, "moderate");
  assert.ok(assessment.signals.includes("explicit-confusion"));
});

test("frustration is treated as a support cue without diagnosing emotion", () => {
  const assessment = detectConfusion("I'm frustrated by this explanation.");

  assert.equal(assessment.severity, "moderate");
  assert.ok(assessment.signals.includes("explicit-frustration"));
});

test("repeated normalized questions in conversation are classified as moderate", () => {
  const assessment = detectConfusion("Why does this reaction happen?", [
    { role: "student", text: "Why does this reaction happen" },
    { role: "tutor", text: "The document says the reaction needs heat." },
  ]);

  assert.equal(assessment.severity, "moderate");
  assert.ok(assessment.signals.includes("repeated-question"));
});

test("repeated unsuccessful attempts and frustration support high severity", () => {
  const assessment = detectConfusion("I'm still getting it wrong and this is frustrating.", [
    { role: "student", text: "I tried that, but it didn't work." },
    { role: "tutor", text: "Let's review the first step." },
    { role: "student", text: "I still got the answer wrong." },
  ]);

  assert.equal(assessment.severity, "high");
  assert.ok(assessment.signals.includes("unsuccessful-attempt"));
  assert.ok(assessment.signals.includes("explicit-frustration"));
});

test("repeating an answer after an explicit tutor correction triggers high support", () => {
  const assessment = detectConfusion("The answer is 12.", [
    { role: "tutor", text: "What is 4 times 2?" },
    { role: "student", text: "The answer is 12." },
    { role: "tutor", text: "Not quite. Try grouping 4 objects twice." },
  ]);

  assert.equal(assessment.severity, "high");
  assert.ok(assessment.signals.includes("repeated-mistake"));
});

test("an answer is not treated as a repeated mistake without corrective feedback", () => {
  const assessment = detectConfusion("The answer is 12.", [
    { role: "tutor", text: "What is 4 times 2?" },
    { role: "student", text: "The answer is 12." },
    { role: "tutor", text: "Let's look at another example." },
  ]);

  assert.equal(assessment.severity, "none");
  assert.ok(!assessment.signals.includes("repeated-mistake"));
});

test("a hint is not treated as explicit tutor correction", () => {
  const assessment = detectConfusion("The answer is 12.", [
    { role: "student", text: "The answer is 12." },
    { role: "hint", text: "Not quite. Review the multiplication step." },
  ]);

  assert.equal(assessment.severity, "none");
  assert.ok(!assessment.signals.includes("repeated-mistake"));
});

test("prior difficulty carries into later questions in the same conversation", () => {
  const assessment = detectConfusion("What should I check next?", [
    { role: "student", text: "I don't understand this step." },
    { role: "tutor", text: "Let's review the relevant sentence." },
  ]);

  assert.equal(assessment.severity, "mild");
  assert.ok(assessment.signals.includes("prior-difficulty"));
});

test("multiple difficulty turns progressively increase support", () => {
  const assessment = detectConfusion("Can we try another example?", [
    { role: "student", text: "I don't understand this step." },
    { role: "tutor", text: "Let's review the relevant sentence." },
    { role: "student", text: "I still got the answer wrong." },
    { role: "tutor", text: "Let's examine the first part." },
  ]);

  assert.equal(assessment.severity, "moderate");
  assert.ok(assessment.signals.includes("prior-difficulty"));
});

test("student evidence is considered while tutor turns are not counted as failures", () => {
  const assessment = detectConfusion("Can we go more slowly?", [
    { role: "tutor", text: "I don't understand; let me try again." },
  ]);

  assert.equal(assessment.severity, "mild");
  assert.deepEqual(assessment.signals, ["simplification-request"]);
});
