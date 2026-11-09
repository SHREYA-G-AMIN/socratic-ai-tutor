import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getDiagramRequest,
  parseTutorResponse,
  renderMermaidSafely,
} from "../src/lib/ai/visual-explanations.ts";

test("explicit diagram requests require a diagram when passages are available", () => {
  assert.equal(getDiagramRequest("Draw a flowchart of the process", true), "required");
  assert.equal(getDiagramRequest("Make a concept map", true), "required");
});

test("process and sequence questions can benefit from an optional diagram", () => {
  assert.equal(
    getDiagramRequest("What are the steps in cellular respiration?", true),
    "optional",
  );
  assert.equal(
    getDiagramRequest("How does the water cycle work?", true),
    "optional",
  );
});

test("ordinary questions do not request diagrams", () => {
  assert.equal(getDiagramRequest("What is ATP?", true), "none");
});

test("missing retrieved passages prevent diagram requests", () => {
  assert.equal(getDiagramRequest("Draw a flowchart", false), "none");
  assert.equal(getDiagramRequest("Explain the steps", false), "none");
});

test("Gemini Mermaid fences are separated from prose without changing plain replies", () => {
  const parsed = parseTutorResponse(
    "The process has two stages.\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nBoth stages are described in the document.",
  );

  assert.equal(
    parsed.reply,
    "The process has two stages.\n\nBoth stages are described in the document.",
  );
  assert.equal(parsed.diagram, "flowchart TD\n  A --> B");

  assert.deepEqual(parseTutorResponse("A source-grounded text answer."), {
    reply: "A source-grounded text answer.",
  });
});

test("empty prose around a diagram receives a neutral response", () => {
  assert.deepEqual(
    parseTutorResponse("```mermaid\nflowchart TD\n  A --> B\n```"),
    {
      reply: "Here is a visual explanation based on the retrieved passages.",
      diagram: "flowchart TD\n  A --> B",
    },
  );
});

test("valid Mermaid output is returned for rendering", async () => {
  const result = await renderMermaidSafely(
    "flowchart TD\n  A[Start] --> B[Finish]",
    async () => "<svg></svg>",
  );

  assert.deepEqual(result, { kind: "rendered", svg: "<svg></svg>" });
});

test("invalid Mermaid output falls back to safe source text", async () => {
  const source = "flowchart TD\n  A -->";
  const result = await renderMermaidSafely(source, async () => {
    throw new Error("Mermaid syntax error");
  });

  assert.deepEqual(result, { kind: "fallback", source });
});

test("overlong Mermaid source uses the text fallback without invoking the renderer", async () => {
  let invoked = false;
  const source = "x".repeat(8_001);
  const result = await renderMermaidSafely(source, async () => {
    invoked = true;
    return "<svg></svg>";
  });

  assert.deepEqual(result, { kind: "fallback", source });
  assert.equal(invoked, false);
});
