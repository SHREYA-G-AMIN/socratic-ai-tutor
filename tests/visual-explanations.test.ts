import { test } from "node:test";
import assert from "node:assert/strict";

import {
  diagramToMermaidSource,
  getDiagramConstraint,
  getDiagramConstraintInstructions,
  getDiagramRequest,
  getDiagramInstructions,
  isExplicitGeneralDiagramRequest,
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
  assert.equal(getDiagramRequest("Gantt chart of the Round Robin example"), "required");
});

test("general diagrams require an explicit general-knowledge request", () => {
  assert.equal(
    isExplicitGeneralDiagramRequest(
      "Draw a diagram using general knowledge about Round Robin",
    ),
    true,
  );
  assert.equal(
    isExplicitGeneralDiagramRequest(
      "Draw the main Round Robin example from my document",
    ),
    false,
  );
  assert.equal(
    isExplicitGeneralDiagramRequest(
      "What does a diagram using general knowledge explain?",
    ),
    false,
  );
  assert.equal(
    getDiagramRequest("Explain this visual explanation in general terms"),
    "none",
  );
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
  assert.equal(getDiagramRequest("What does the process scheduler do?"), "none");
  assert.equal(getDiagramRequest("What is a Gantt chart?"), "none");
  assert.equal(getDiagramRequest("I don't want a Gantt chart, just the exact quantum"), "none");
});

const ganttPassage =
  "RR Gantt timeline: P1 0-2, P2 2-4, P3 4-6.";
const ganttDiagram: DiagramData = {
  type: "flowchart",
  direction: "LR",
  nodes: [
    { id: "p1_first", label: "P1 0-2", sourceIndex: 1, evidence: ganttPassage },
    { id: "p2", label: "P2 2-4", sourceIndex: 1, evidence: ganttPassage },
    { id: "p3", label: "P3 4-6", sourceIndex: 1, evidence: ganttPassage },
  ],
  edges: [
    { from: "p1_first", to: "p2", label: "next", sourceIndex: 1, evidence: ganttPassage },
    { from: "p2", to: "p3", label: "next", sourceIndex: 1, evidence: ganttPassage },
  ],
};

const readyQueuePassage = "At time 4, the ready queue is P3, P1.";
const readyQueueDiagram: DiagramData = {
  type: "flowchart",
  direction: "LR",
  nodes: [
    { id: "queue_t4", label: "Ready queue at t=4", sourceIndex: 1, evidence: readyQueuePassage },
    { id: "p3", label: "P3", sourceIndex: 1, evidence: readyQueuePassage },
    { id: "p1", label: "P1", sourceIndex: 1, evidence: readyQueuePassage },
  ],
  edges: [
    { from: "queue_t4", to: "p3", label: "front", sourceIndex: 1, evidence: readyQueuePassage },
    { from: "p3", to: "p1", label: "next", sourceIndex: 1, evidence: readyQueuePassage },
  ],
};

test("Gantt diagrams preserve every cited process interval and chronological order", () => {
  const constraint = getDiagramConstraint("Draw a Gantt chart for the RR example");
  assert.deepEqual(constraint, { kind: "gantt" });
  assert.match(getDiagramConstraintInstructions(constraint), /exact process ID and start-end interval/i);
  assert.deepEqual(
    validateGroundedDiagram(ganttDiagram, [ganttPassage], constraint),
    ganttDiagram,
  );
});

test("Gantt validation accepts colon-separated process IDs and intervals", () => {
  const passage =
    "RR Gantt timeline: P1: 0–2, P2: 2–4, P3: 4–6.";
  const diagram: DiagramData = {
    ...ganttDiagram,
    nodes: ganttDiagram.nodes.map((node) => ({
      ...node,
      label: node.label.replace(/^(\w+)\s+(\d+)-(\d+)$/, "$1: $2–$3"),
      evidence: passage,
    })),
    edges: ganttDiagram.edges.map((edge) => ({
      ...edge,
      evidence: passage,
    })),
  };

  assert.deepEqual(
    validateGroundedDiagram(diagram, [passage], { kind: "gantt" }),
    diagram,
  );
});

test("Gantt diagrams reject altered process IDs, intervals, and execution order", () => {
  const constraint = { kind: "gantt" } as const;
  const alteredProcess = {
    ...ganttDiagram,
    nodes: ganttDiagram.nodes.map((node, index) =>
      index === 0 ? { ...node, label: "P9 0-2" } : node,
    ),
  };
  const alteredInterval = {
    ...ganttDiagram,
    nodes: ganttDiagram.nodes.map((node, index) =>
      index === 0 ? { ...node, label: "P1 0-3" } : node,
    ),
  };
  const alteredOrder = {
    ...ganttDiagram,
    nodes: [
      ganttDiagram.nodes[1],
      ganttDiagram.nodes[0],
      ganttDiagram.nodes[2],
    ],
    edges: [
      { ...ganttDiagram.edges[0], from: "p2", to: "p1_first" },
      { ...ganttDiagram.edges[1], from: "p1_first", to: "p3" },
    ],
  };

  assert.equal(validateGroundedDiagram(alteredProcess, [ganttPassage], constraint), null);
  assert.equal(validateGroundedDiagram(alteredInterval, [ganttPassage], constraint), null);
  assert.equal(validateGroundedDiagram(alteredOrder, [ganttPassage], constraint), null);
});

test("ready-queue diagrams preserve the process order at the requested time", () => {
  const constraint = getDiagramConstraint("Draw the ready queue at time 4");
  assert.deepEqual(constraint, { kind: "ready-queue", requestedTime: 4 });
  assert.deepEqual(getDiagramConstraint("Diagram of ready queue time 4"), {
    kind: "ready-queue",
    requestedTime: 4,
  });
  assert.match(getDiagramConstraintInstructions(constraint), /exact queue order/i);
  assert.deepEqual(
    validateGroundedDiagram(readyQueueDiagram, [readyQueuePassage], constraint),
    readyQueueDiagram,
  );

  const reversedQueue = {
    ...readyQueueDiagram,
    nodes: [
      readyQueueDiagram.nodes[0],
      readyQueueDiagram.nodes[2],
      readyQueueDiagram.nodes[1],
    ],
    edges: [
      { ...readyQueueDiagram.edges[0], to: "p1" },
      { ...readyQueueDiagram.edges[1], from: "p1", to: "p3" },
    ],
  };
  assert.equal(
    validateGroundedDiagram(reversedQueue, [readyQueuePassage], constraint),
    null,
  );
});

test("diagram instructions require source-indexed exact evidence", () => {
  assert.match(
    getDiagramInstructions("required", true),
    /exact, case-sensitive evidence quote/i,
  );
  assert.match(getDiagramInstructions("required", true), /1-based/i);
  assert.match(getDiagramInstructions("required", true), /preserve its actual values and execution order/i);
  assert.match(getDiagramInstructions("required", true), /one connected node per CPU time slice/i);
  assert.match(getDiagramInstructions("required", true), /not generic concept labels/i);
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

test("inline json code responses are normalized and parsed as general diagrams", () => {
  const generalDiagram = {
    type: "concept",
    direction: "TD",
    nodes: [
      { id: "hardware", label: "Computer Hardware" },
      { id: "kernel", label: "Operating System Kernel" },
      { id: "apps", label: "Application Software" },
    ],
    edges: [
      { from: "hardware", to: "kernel", label: "managed by" },
      { from: "kernel", to: "apps", label: "supports execution" },
    ],
  };
  const parsed = parseTutorResponse(
    `A general explanation.\n\n\x60json ${JSON.stringify(generalDiagram)} \x60`,
    {
      allowDiagram: true,
      requireDiagram: true,
      allowUngroundedDiagram: true,
    },
  );

  assert.equal(parsed.reply, "A general explanation.");
  assert.equal(parsed.diagramData?.nodes.length, 3);
  assert.match(parsed.diagram ?? "", /^flowchart LR/);
  assert.match(parsed.diagram ?? "", /supports execution/);
});

test("general diagrams tolerate optional provenance fields from the model", () => {
  const data = {
    type: "concept",
    direction: "TD",
    nodes: [
      { id: "hardware", label: "Computer Hardware", sourceIndex: 1, evidence: "Computer Hardware" },
      { id: "kernel", label: "Operating System Kernel", sourceIndex: 1, evidence: "Operating System Kernel" },
    ],
    edges: [
      { from: "hardware", to: "kernel", label: "managed by", sourceIndex: 1, evidence: "Computer Hardware managed by Operating System Kernel" },
    ],
  };
  const parsed = parseTutorResponse(
    `General explanation.\n\n\x60\x60\x60diagram-json\n${JSON.stringify(data)}\n\x60\x60\x60`,
    { allowDiagram: true, requireDiagram: true, allowUngroundedDiagram: true },
  );
  assert.equal(parsed.diagramData?.nodes.length, 2);
  assert.match(parsed.diagram ?? "", /managed by/);
});

test("fenced JSON diagram responses render and SVG artifacts stay out of chat prose", () => {
  const generalDiagram = {
    type: "concept",
    direction: "LR",
    nodes: [
      { id: "users", label: "End Users" },
      { id: "os", label: "Operating System" },
      { id: "hardware", label: "Computer Hardware" },
    ],
    edges: [
      { from: "users", to: "os", label: "interacts with" },
      { from: "os", to: "hardware", label: "manages" },
    ],
  };
  const parsed = parseTutorResponse(
    `Here is a general-knowledge diagram.\n\n\x60\x60\x60json\n${JSON.stringify(generalDiagram)}\n\x60\x60\x60\n\n**svg**`,
    { allowDiagram: true, requireDiagram: true, allowUngroundedDiagram: true },
  );

  assert.equal(parsed.diagramData?.nodes.length, 3);
  assert.match(parsed.diagram ?? "", /interacts with/);
  assert.doesNotMatch(parsed.reply, /\*\*svg\*\*/i);
  assert.doesNotMatch(parsed.reply, /<svg/i);
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
  assert.equal(
    validateDiagramStructure({
      ...flowchart,
      nodes: [
        ...flowchart.nodes,
        {
          id: "orphan",
          label: "orphan",
          sourceIndex: 1,
          evidence: flowchartPassage,
        },
      ],
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

test("scheduler and dispatcher diagrams reject unsupported steps", () => {
  const passage =
    "The short-term scheduler selects a process from the ready queue. The dispatcher gives control of the CPU to the selected process.";
  const unsupportedStep: DiagramData = {
    type: "flowchart",
    direction: "TD",
    nodes: [
      { id: "scheduler", label: "short-term scheduler", sourceIndex: 1, evidence: passage },
      { id: "process", label: "process", sourceIndex: 1, evidence: passage },
      { id: "dispatcher", label: "dispatcher", sourceIndex: 1, evidence: passage },
      { id: "cpu", label: "CPU", sourceIndex: 1, evidence: passage },
      { id: "registers", label: "registers", sourceIndex: 1, evidence: passage },
    ],
    edges: [
      { from: "scheduler", to: "process", label: "selects", sourceIndex: 1, evidence: passage },
      { from: "dispatcher", to: "cpu", label: "gives control of", sourceIndex: 1, evidence: passage },
      { from: "dispatcher", to: "registers", label: "saves", sourceIndex: 1, evidence: passage },
    ],
  };

  assert.equal(validateGroundedDiagram(unsupportedStep, [passage]), null);
});

test("invalid or unsupported diagram data is omitted while the answer remains", () => {
  const invalidGantt = {
    ...ganttDiagram,
    nodes: ganttDiagram.nodes.map((node, index) =>
      index === 0 ? { ...node, label: "P9 0-2" } : node,
    ),
  };
  const parsed = parseTutorResponse(
    tutorResponse(invalidGantt).replace(
      "A visual explanation:",
      "The retrieved passage explains the schedule.",
    ),
    {
      allowDiagram: true,
      requireDiagram: true,
      sourcePassages: [ganttPassage],
      diagramConstraint: { kind: "gantt" },
    },
  );

  assert.equal(parsed.diagram, undefined);
  assert.equal(parsed.diagramData, undefined);
  assert.match(parsed.reply, /retrieved passage explains the schedule/i);
  assert.match(parsed.reply, /diagram could not be validated/i);
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
  assert.equal(
    validateGroundedDiagram(
      {
        ...flowchart,
        nodes: [
          { ...flowchart.nodes[0], evidence: flowchartPassage.toLowerCase() },
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

test("internal SVG hints are removed from tutor-facing prose", () => {
  const parsed = parseTutorResponse(
    ["Here is the explanation.", "**svgHint**"].join("\n\n"),
    { allowDiagram: false },
  );
  assert.equal(parsed.reply, "Here is the explanation.");
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
