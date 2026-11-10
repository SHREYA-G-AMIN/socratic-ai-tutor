export type DiagramRequest = "none" | "optional" | "required";
export type DiagramType = "flowchart" | "concept";
export type DiagramDirection = "TD" | "LR";

export interface DiagramNode {
  id: string;
  label: string;
  sourceIndex: number;
  evidence: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  sourceIndex: number;
  evidence: string;
}

export interface DiagramData {
  type: DiagramType;
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface ParsedTutorResponse {
  reply: string;
  diagram?: string;
  diagramData?: DiagramData;
}

export type MermaidRenderResult =
  | { kind: "rendered"; svg: string }
  | { kind: "fallback"; source: string }
  | { kind: "unavailable" };

export const MAX_MERMAID_SOURCE_LENGTH = 8_000;
const MAX_DIAGRAM_NODES = 12;
const MAX_DIAGRAM_EDGES = 20;
const MAX_DIAGRAM_LABEL_LENGTH = 100;
const MAX_EVIDENCE_LENGTH = 500;

const EXPLICIT_DIAGRAM_REQUEST =
  /\b(?:diagram|flowchart|concept map|process map|visual(?:ly|ization|isation)?|draw|map out)\b/i;
const DIAGRAM_WORTHY_QUESTION =
  /\b(?:steps?|stages?|sequence|process|cycle|workflow|pathway|life cycle|relationship between|how (?:does|do|is|are)\b.*\bwork)\b/i;
const DIAGRAM_BLOCK = /```(diagram-json|mermaid)\s*\r?\n([\s\S]*?)```/gi;
const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function getDiagramRequest(message: string): DiagramRequest {
  if (EXPLICIT_DIAGRAM_REQUEST.test(message)) {
    return "required";
  }

  return DIAGRAM_WORTHY_QUESTION.test(message) ? "optional" : "none";
}

export function getDiagramInstructions(
  request: DiagramRequest,
  hasRetrievedPassages: boolean,
): string {
  if (!hasRetrievedPassages) {
    return `No retrieved passages support a course-specific diagram. If the student requested one, explain that the available document passages do not support a reliable visual explanation. Do not invent nodes, steps, or relationships and do not include a diagram-json block.`;
  }

  if (request === "none") {
    return `Do not include a diagram-json block in this response. Retrieved passages are the only allowed source for course-specific claims.`;
  }

  const outputContract = `If the passages support a useful diagram, return exactly one fenced \`\`\`diagram-json block containing strict JSON with exactly these keys: {"type":"flowchart"|"concept","direction":"TD"|"LR","nodes":[{"id":"stable_id","label":"short label","sourceIndex":1,"evidence":"exact passage quote"}],"edges":[{"from":"node_id","to":"node_id","label":"relationship text","sourceIndex":1,"evidence":"exact passage quote"}]}. Passage indexes are 1-based and refer to the numbered Context Passages in the latest user request. Include 2-12 nodes and 1-20 labeled edges. Every node and edge must cite one retrieved passage with an exact, case-sensitive evidence quote no longer than 500 characters. Each node label and edge label must be a verbatim phrase in its own evidence quote. Each edge quote must contain its source-node label before its target-node label and support the labeled relationship. Use only these keys; do not include prose, markdown, Mermaid, or extra fields inside the JSON block. Do not use prior answers or outside knowledge as diagram evidence.`;

  if (request === "required") {
    return `The student explicitly requested a visual explanation. Choose "flowchart" for a documented sequence or process, or "concept" for documented concepts and relationships. ${outputContract} If the passages cannot support a useful diagram, say so without inventing steps or relationships and omit the block.`;
  }

  return `A diagram may help explain this process or sequence. Include at most one diagram-json block only if the retrieved passages support all of its nodes and relationships. ${outputContract} Otherwise answer normally without a diagram.`;
}

export function validateDiagramStructure(value: unknown): DiagramData | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "direction", "nodes", "edges"])) {
    return null;
  }

  if (
    (value.type !== "flowchart" && value.type !== "concept") ||
    (value.direction !== "TD" && value.direction !== "LR") ||
    !Array.isArray(value.nodes) ||
    value.nodes.length < 2 ||
    value.nodes.length > MAX_DIAGRAM_NODES ||
    !Array.isArray(value.edges) ||
    value.edges.length < 1 ||
    value.edges.length > MAX_DIAGRAM_EDGES
  ) {
    return null;
  }

  const nodes: DiagramNode[] = [];
  const nodeById = new Map<string, DiagramNode>();

  for (const candidate of value.nodes) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["id", "label", "sourceIndex", "evidence"]) ||
      typeof candidate.id !== "string" ||
      !NODE_ID_PATTERN.test(candidate.id) ||
      nodeById.has(candidate.id) ||
      !isBoundedText(candidate.label, MAX_DIAGRAM_LABEL_LENGTH) ||
      !isSourceIndex(candidate.sourceIndex) ||
      !isBoundedText(candidate.evidence, MAX_EVIDENCE_LENGTH)
    ) {
      return null;
    }

    const node: DiagramNode = {
      id: candidate.id,
      label: candidate.label.trim(),
      sourceIndex: candidate.sourceIndex,
      evidence: candidate.evidence.trim(),
    };
    if (!containsPhrase(node.evidence, node.label)) {
      return null;
    }

    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const edges: DiagramEdge[] = [];
  for (const candidate of value.edges) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["from", "to", "label", "sourceIndex", "evidence"]) ||
      typeof candidate.from !== "string" ||
      typeof candidate.to !== "string" ||
      candidate.from === candidate.to ||
      !isBoundedText(candidate.label, MAX_DIAGRAM_LABEL_LENGTH) ||
      !isSourceIndex(candidate.sourceIndex) ||
      !isBoundedText(candidate.evidence, MAX_EVIDENCE_LENGTH)
    ) {
      return null;
    }

    const from = nodeById.get(candidate.from);
    const to = nodeById.get(candidate.to);
    const evidence = candidate.evidence.trim();
    if (
      !from ||
      !to ||
      !containsPhrase(evidence, candidate.label) ||
      !containsPhraseInOrder(evidence, from.label, to.label)
    ) {
      return null;
    }

    edges.push({
      from: candidate.from,
      to: candidate.to,
      label: candidate.label.trim(),
      sourceIndex: candidate.sourceIndex,
      evidence,
    });
  }

  return {
    type: value.type,
    direction: value.direction,
    nodes,
    edges,
  };
}

export function validateGroundedDiagram(
  value: unknown,
  passages: string[],
): DiagramData | null {
  const diagram = validateDiagramStructure(value);
  if (!diagram) {
    return null;
  }

  const citations = [
    ...diagram.nodes.map((node) => ({
      sourceIndex: node.sourceIndex,
      evidence: node.evidence,
    })),
    ...diagram.edges.map((edge) => ({
      sourceIndex: edge.sourceIndex,
      evidence: edge.evidence,
    })),
  ];

  return citations.every(
    ({ sourceIndex, evidence }) =>
      sourceIndex <= passages.length && passages[sourceIndex - 1].includes(evidence),
  )
    ? diagram
    : null;
}

export function diagramToMermaidSource(value: unknown): string | null {
  const diagram = validateDiagramStructure(value);
  if (!diagram) {
    return null;
  }

  const direction = diagram.type === "concept" ? "LR" : diagram.direction;
  const lines = [
    `flowchart ${direction}`,
    ...diagram.nodes.map(
      (node) => `  ${node.id}["${escapeMermaidLabel(node.label)}"]`,
    ),
    ...diagram.edges.map(
      (edge) =>
        `  ${edge.from} -->|${escapeMermaidLabel(edge.label)}| ${edge.to}`,
    ),
  ];
  const source = lines.join("\n");
  return source.length <= MAX_MERMAID_SOURCE_LENGTH ? source : null;
}

export function parseTutorResponse(
  response: string,
  options: {
    allowDiagram?: boolean;
    requireDiagram?: boolean;
    sourcePassages?: string[];
  } = {},
): ParsedTutorResponse {
  const allowDiagram = options.allowDiagram ?? true;
  let diagramData: DiagramData | undefined;
  let diagramAttempted = false;
  let invalidDiagram = false;
  let rejectedDiagram = false;
  let additionalDiagram = false;
  const prose = response.replace(
    DIAGRAM_BLOCK,
    (block, format: string, content: string) => {
      if (!allowDiagram) {
        rejectedDiagram = true;
        return "";
      }

      if (diagramAttempted) {
        additionalDiagram = true;
        return "";
      }
      diagramAttempted = true;

      if (
        format !== "diagram-json" ||
        content.length > MAX_MERMAID_SOURCE_LENGTH
      ) {
        invalidDiagram = true;
        return "";
      }

      try {
        const parsed: unknown = JSON.parse(content);
        const validated = validateGroundedDiagram(
          parsed,
          options.sourcePassages ?? [],
        );
        if (!validated) {
          invalidDiagram = true;
        } else {
          diagramData = validated;
        }
      } catch {
        invalidDiagram = true;
      }

      return "";
    },
  );
  let reply = prose.trim().replace(/\n{3,}/g, "\n\n");
  if (additionalDiagram) {
    reply = `${reply}${reply ? "\n\n" : ""}Additional diagram blocks were omitted.`;
  } else if (invalidDiagram || (options.requireDiagram && !diagramAttempted)) {
    reply = `${reply}${reply ? "\n\n" : ""}A grounded diagram could not be validated, so it was omitted.`;
  }

  return {
    reply:
      reply ||
      (diagramData
        ? "Here is a visual explanation based on the retrieved passages."
        : rejectedDiagram
          ? "The retrieved passages do not support a reliable diagram for this request."
          : response.trim()),
    ...(diagramData
      ? {
          diagramData,
          diagram: diagramToMermaidSource(diagramData) ?? undefined,
        }
      : {}),
  };
}

export async function renderMermaidSafely(
  source: string | null,
  render: (source: string) => Promise<string>,
): Promise<MermaidRenderResult> {
  if (source === null) {
    return { kind: "unavailable" };
  }
  if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
    return { kind: "fallback", source };
  }

  try {
    return { kind: "rendered", svg: await render(source) };
  } catch {
    return { kind: "fallback", source };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength &&
    !/[\r\n]/.test(value)
  );
}

function isSourceIndex(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1;
}

function containsPhrase(text: string, phrase: string): boolean {
  return normalizePhrase(text).includes(normalizePhrase(phrase));
}

function containsPhraseInOrder(
  text: string,
  firstPhrase: string,
  secondPhrase: string,
): boolean {
  const normalizedText = normalizePhrase(text);
  const firstIndex = normalizedText.indexOf(normalizePhrase(firstPhrase));
  if (firstIndex < 0) {
    return false;
  }
  return (
    normalizedText.indexOf(
      normalizePhrase(secondPhrase),
      firstIndex + normalizePhrase(firstPhrase).length,
    ) >= 0
  );
}

function normalizePhrase(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\|/g, "¦");
}
