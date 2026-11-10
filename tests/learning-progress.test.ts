import { test } from "node:test";
import assert from "node:assert/strict";

import { getLearningProgress } from "../src/lib/ai/learning-progress.ts";

test("no conversation evidence does not claim progress or mastery", () => {
  const progress = getLearningProgress([
    { role: "tutor", text: "Welcome. What would you like to study?" },
  ]);

  assert.equal(progress.label, "Getting started");
  assert.equal(progress.confirmedAnswers, 0);
  assert.equal(progress.corrections, 0);
  assert.match(progress.description, /not a mastery score/i);
});

test("only explicit tutor feedback after a tutor question confirms answers", () => {
  const progress = getLearningProgress([
    { role: "tutor", text: "Which values belong in the left subtree?" },
    { role: "student", text: "Values smaller than the current node." },
    { role: "tutor", text: "Exactly, that is correct." },
    { role: "tutor", text: "What happens if the target is larger?" },
    { role: "student", text: "Go to the right child." },
    { role: "tutor", text: "Not quite. Compare it with the current node first." },
  ]);

  assert.equal(progress.confirmedAnswers, 1);
  assert.equal(progress.corrections, 1);
  assert.equal(progress.label, "Practicing with extra support");
  assert.match(progress.description, /1 tutor-confirmed answer/);
  assert.match(progress.description, /1 correction/);
});

test("hint requests and confusion evidence are reflected without diagnosing students", () => {
  const progress = getLearningProgress([
    { role: "tutor", text: "What does the source say happens next?" },
    { role: "student", text: "Could I get a hint?" },
    { role: "hint", text: "Look at the ordering property." },
    { role: "tutor", text: "What values are smaller than the node?" },
    { role: "student", text: "I still don't understand this step." },
    { role: "tutor", text: "Let's break that into a smaller step." },
  ]);

  assert.equal(progress.hints, 1);
  assert.equal(progress.supportMoments, 1);
  assert.equal(progress.label, "Practicing with extra support");
  assert.match(progress.description, /1 hint/);
  assert.match(progress.description, /1 extra-support moment/);
  assert.doesNotMatch(progress.description, /frustrated|diagnos/i);
});

test("mentioning a hint without requesting one does not inflate hint progress", () => {
  const progress = getLearningProgress([
    { role: "student", text: "The hint helped me understand the left subtree." },
  ]);

  assert.equal(progress.hints, 0);
});

test("mild requests for support count without counting carried context again", () => {
  const progress = getLearningProgress([
    { role: "tutor", text: "What does this step mean?" },
    { role: "student", text: "I don't understand this step." },
    { role: "tutor", text: "Let's use smaller steps." },
    { role: "student", text: "What should I check next?" },
  ]);

  assert.equal(progress.supportMoments, 1);
});

test("answer wording alone does not count as understanding", () => {
  const progress = getLearningProgress([
    { role: "tutor", text: "Tell me about the BST." },
    { role: "student", text: "The answer is definitely correct." },
    { role: "tutor", text: "Let's check that against the passage." },
  ]);

  assert.equal(progress.confirmedAnswers, 0);
  assert.equal(progress.corrections, 0);
  assert.equal(progress.label, "Practicing");
});
