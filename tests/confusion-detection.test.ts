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

test("student evidence is considered while tutor turns are not counted as failures", () => {
  const assessment = detectConfusion("Can we go more slowly?", [
    { role: "tutor", text: "I don't understand; let me try again." },
  ]);

  assert.equal(assessment.severity, "mild");
  assert.deepEqual(assessment.signals, ["simplification-request"]);
});
