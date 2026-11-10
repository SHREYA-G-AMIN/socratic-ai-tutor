import { test } from "node:test";
import assert from "node:assert/strict";

import {
  diagramToMermaidSource,
  getDiagramRequest,
  getDiagramInstructions,
  parseTutorResponse,
  renderMermaidSafely,
  validateGroundedDiagram,
  validateDiagramStructure,
  type DiagramData,
} from "../src/lib/ai/visual-explanations.ts";

const flowchartPassage =
  "If the target is smaller than the current node, continue to the left child.";
const flowchart: DiagramData = {
  type: "flowchart",
  direction: "TD",
  nodes: [
    {
      id: "target",
      label: "target",
      sourceIndex: 1,
      evidence: flowchartPassage,
    },
    {
      id: "left_child",
      label: "left child",
      sourceIndex: 1,
      evidence: flowchartPassage,
    },
  ],
  edges: [
    {
      from: "target",
      to: "left_child",
      label: "continue to",
      sourceIndex: 1,
      evidence: flowchartPassage,
    },
  ],
};

const conceptPassage =
  "In a BST, values smaller than a node are stored in its left subtree.";
const concept: DiagramData = {
  type: "concept",
  direction: "LR",
  nodes: [
    {
      id: "smaller_values",
      label: "values smaller",
      sourceIndex: 1,
      evidence: conceptPassage,
    },
    {
      id: "left_subtree",
      label: "left subtree",
      sourceIndex: 1,
      evidence: conceptPassage,
    },
  ],
  edges: [
    {
      from: "smaller_values",
      to: "left_subtree",
      label: "are stored in",
      sourceIndex: 1,
      evidence: conceptPassage,
    },
  ],
};

function tutorResponse(diagram: unknown): string {
  return `A visual explanation:\n\n\`\`\`diagram-json\n${JSON.stringify(diagram)}\n\`\`\``;
}

test("explicit diagram requests require structured diagram output", () => {
  assert.equal(getDiagramRequest("Draw a flowchart of the process"), "required");
  assert.equal(getDiagramRequest("Make a concept map"), "required");
});

test("process and sequence questions can benefit from an optional diagram", () => {
  assert.equal(
    getDiagramRequest("What are the steps in cellular respiration?"),
    "optional",
  );
  assert.equal(
    getDiagramRequest("How does the water cycle work?"),
    "optional",
  );
});

test("ordinary questions do not request diagrams", () => {
  assert.equal(getDiagramRequest("What is ATP?"), "none");
});

test("diagram instructions require source-indexed exact evidence", () => {
  assert.match(
    getDiagramInstructions("required", true),
    /exact, case-sensitive evidence quote/i,
  );
  assert.match(getDiagramInstructions("required", true), /1-based/i);
  assert.match(
    getDiagramInstructions("required", false),
    /do not invent nodes, steps, or relationships/i,
  );
  assert.match(
    getDiagramInstructions("none", true),
    /Do not include a diagram-json block/i,
  );
});

test("valid flowcharts are parsed, grounded, and retained as structured data", () => {
  const parsed = parseTutorResponse(tutorResponse(flowchart), {
    allowDiagram: true,
    requireDiagram: true,
    sourcePassages: [flowchartPassage],
  });

  assert.equal(parsed.reply, "A visual explanation:");
  assert.deepEqual(parsed.diagramData, flowchart);
  assert.equal(
    parsed.diagram,
    'flowchart TD\n  target["target"]\n  left_child["left child"]\n  target -->|continue to| left_child',
  );
});

test("valid concept diagrams preserve relationship and citation data", () => {
  const parsed = parseTutorResponse(tutorResponse(concept), {
    allowDiagram: true,
    sourcePassages: [conceptPassage],
  });

  assert.deepEqual(parsed.diagramData, concept);
  assert.match(parsed.diagram ?? "", /^flowchart LR/);
  assert.match(parsed.diagram ?? "", /are stored in/);
});

test("malformed JSON and schema violations are safely omitted", () => {
  const malformed = parseTutorResponse(
    "Summary.\n```diagram-json\n{broken json\n```",
    { allowDiagram: true, sourcePassages: [flowchartPassage] },
  );
  assert.equal(malformed.diagram, undefined);
  assert.equal(malformed.diagramData, undefined);
  assert.match(malformed.reply, /diagram could not be validated/i);

  assert.equal(
    validateDiagramStructure({ ...flowchart, unexpected: true }),
    null,
  );
  assert.equal(
    validateDiagramStructure({ ...flowchart, nodes: flowchart.nodes.slice(0, 1) }),
    null,
  );
  assert.equal(
    validateDiagramStructure({
      ...flowchart,
      nodes: [{ ...flowchart.nodes[0], id: "invalid id" }, flowchart.nodes[1]],
    }),
    null,
  );
});

test("unsupported node and relationship content is rejected", () => {
  const unsupportedNode: DiagramData = {
    ...flowchart,
    nodes: [
      flowchart.nodes[0],
      { ...flowchart.nodes[1], label: "right child" },
    ],
  };
  assert.equal(
    validateGroundedDiagram(unsupportedNode, [flowchartPassage]),
    null,
  );

  const unsupportedRelationship: DiagramData = {
    ...flowchart,
    edges: [
      {
        ...flowchart.edges[0],
        from: "left_child",
        to: "target",
        evidence: flowchartPassage,
      },
    ],
  };
  assert.equal(
    validateGroundedDiagram(unsupportedRelationship, [flowchartPassage]),
    null,
  );

  const unquotedClaim: DiagramData = {
    ...flowchart,
    edges: [{ ...flowchart.edges[0], label: "causes" }],
  };
  assert.equal(validateGroundedDiagram(unquotedClaim, [flowchartPassage]), null);
});

test("evidence must be an exact quote from the cited retrieved passage", () => {
  assert.equal(
    validateGroundedDiagram(
      { ...flowchart, nodes: flowchart.nodes.map((node) => ({ ...node, sourceIndex: 2 })) },
      [flowchartPassage],
    ),
    null,
  );
  assert.equal(
    validateGroundedDiagram(
      {
        ...flowchart,
        nodes: [
          { ...flowchart.nodes[0], evidence: "The target is smaller." },
          flowchart.nodes[1],
        ],
      },
      [flowchartPassage],
    ),
    null,
  );
});

test("diagram output is suppressed when it was not requested", () => {
  const parsed = parseTutorResponse(tutorResponse(flowchart), {
    allowDiagram: false,
    sourcePassages: [flowchartPassage],
  });

  assert.equal(parsed.diagram, undefined);
  assert.equal(parsed.diagramData, undefined);
  assert.equal(parsed.reply, "A visual explanation:");
});

test("required diagrams missing from the response receive a safe fallback", () => {
  const parsed = parseTutorResponse("Here is the explanation.", {
    allowDiagram: true,
    requireDiagram: true,
    sourcePassages: [flowchartPassage],
  });

  assert.match(parsed.reply, /diagram could not be validated/i);
  assert.equal(parsed.diagramData, undefined);
});

test("legacy Mermaid blocks are rejected instead of bypassing structured validation", () => {
  const parsed = parseTutorResponse(
    "Explanation.\n```mermaid\nflowchart TD\n A --> B\n```",
    { allowDiagram: true, sourcePassages: [flowchartPassage] },
  );

  assert.equal(parsed.diagram, undefined);
  assert.match(parsed.reply, /diagram could not be validated/i);
});

test("invalid and unavailable diagram rendering uses accessible fallback states", async () => {
  const unavailable = await renderMermaidSafely(null, async () => {
    assert.fail("renderer must not run for invalid structured data");
  });
  assert.deepEqual(unavailable, { kind: "unavailable" });

  const source = "flowchart TD\n  A -->";
  const invalid = await renderMermaidSafely(source, async () => {
    throw new Error("Mermaid syntax error");
  });
  assert.deepEqual(invalid, { kind: "fallback", source });
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

test("structured diagram source escapes Mermaid control delimiters", () => {
  const quotedPassage =
    'If the target "value" is smaller than the current node, continue to the left child.';
  const safeData: DiagramData = {
    ...flowchart,
    nodes: flowchart.nodes.map((node) => ({
      ...node,
      label: node.id === "target" ? 'target "value"' : node.label,
      evidence: quotedPassage,
    })),
    edges: flowchart.edges.map((edge) => ({
      ...edge,
      evidence: quotedPassage,
    })),
  };
  const source = diagramToMermaidSource(safeData);
  assert.ok(source);
  assert.ok(source.includes(String.raw`target["target \"value\""]`));
});
