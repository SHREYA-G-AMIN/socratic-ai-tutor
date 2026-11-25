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
  /\b(?:diagrams?|daigrams?|flowchart|concept map|process map|visual(?:ly|ization|isation)?|draw(?:\s+(?:one|it|a))?|map out)\b/i;
const DIAGRAM_WORTHY_QUESTION =
  /\b(?:steps?|stages?|sequence|process|cycle|workflow|pathway|life cycle|relationship between|how (?:does|do|is|are)\b.*\bwork)\b/i;
const DIAGRAM_BLOCK = /```(?:diagram-json|json|mermaid)?[^\n]*\r?\n([\s\S]*?)```/gi;
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

  const outputContract = `Return a fenced \`\`\`diagram-json block containing strict JSON with this shape: {"type":"flowchart"|"concept","direction":"TD"|"LR","nodes":[{"id":"stable_id","label":"short label","sourceIndex":1,"evidence":"short quote from passage"}],"edges":[{"from":"node_id","to":"node_id","label":"relationship","sourceIndex":1,"evidence":"short quote from passage"}]}. Passage indexes are 1-based and refer to the numbered Context Passages in the latest user request. Include 2-12 nodes and 1-20 labeled edges. Keep labels concise (under 80 chars) and use valid node IDs matching /^[A-Za-z][A-Za-z0-9_]{0,31}$/. Base all nodes and edges on the retrieved passages.`;

  if (request === "required") {
    return `The student explicitly requested a visual explanation. Choose "flowchart" for a documented sequence or process, or "concept" for documented concepts and relationships. ${outputContract}`;
  }

  return `A diagram may help explain this process or sequence. Include at most one diagram-json block if the retrieved passages support it. ${outputContract} Otherwise answer normally without a diagram.`;
}

export function validateDiagramStructure(value: unknown): DiagramData | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "direction", "nodes", "edges"])) {
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

  for (let i = 0; i < value.nodes.length; i++) {
    const candidate = value.nodes[i];
    if (!isRecord(candidate)) {
      return null;
    }

    const rawId =
      typeof candidate.id === "string" && NODE_ID_PATTERN.test(candidate.id.trim())
        ? candidate.id.trim()
        : `node_${i + 1}`;
    const uniqueId = nodeById.has(rawId) ? `${rawId}_${i + 1}` : rawId;
    const rawLabel =
      typeof candidate.label === "string" ? candidate.label.trim() : "";

    if (!isBoundedText(rawLabel, MAX_DIAGRAM_LABEL_LENGTH)) {
      return null;
    }

    const sourceIndex = isSourceIndex(candidate.sourceIndex)
      ? candidate.sourceIndex
      : 1;
    const evidence =
      typeof candidate.evidence === "string" && candidate.evidence.trim().length > 0
        ? candidate.evidence.trim().slice(0, MAX_EVIDENCE_LENGTH)
        : rawLabel;

    const node: DiagramNode = {
      id: uniqueId,
      label: rawLabel,
      sourceIndex,
      evidence,
    };

    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const edges: DiagramEdge[] = [];
  for (const candidate of value.edges) {
    if (
      !isRecord(candidate) ||
      typeof candidate.from !== "string" ||
      typeof candidate.to !== "string" ||
      candidate.from === candidate.to
    ) {
      continue;
    }

    const from = nodeById.get(candidate.from.trim());
    const to = nodeById.get(candidate.to.trim());
    if (!from || !to) {
      continue;
    }

    const label =
      typeof candidate.label === "string" && candidate.label.trim().length > 0
        ? candidate.label.trim().slice(0, MAX_DIAGRAM_LABEL_LENGTH)
        : "relates to";
    const sourceIndex = isSourceIndex(candidate.sourceIndex)
      ? candidate.sourceIndex
      : 1;
    const evidence =
      typeof candidate.evidence === "string" && candidate.evidence.trim().length > 0
        ? candidate.evidence.trim().slice(0, MAX_EVIDENCE_LENGTH)
        : `${from.label} ${label} ${to.label}`.slice(0, MAX_EVIDENCE_LENGTH);

    edges.push({
      from: from.id,
      to: to.id,
      label,
      sourceIndex,
      evidence,
    });
  }

  if (edges.length < 1) {
    return null;
  }

  return {
    type: value.type,
    direction: value.direction,
    nodes,
    edges,
  };
}

export function validateGeneralDiagram(value: unknown): DiagramData | null {
  return validateDiagramStructure(value);
}

export function validateGroundedDiagram(
  value: unknown,
  passages: string[],
): DiagramData | null {
  const diagram = validateDiagramStructure(value);
  if (!diagram) {
    return null;
  }

  const normalizedPassages = passages.map((p) => normalizePhrase(p));
  const combinedPassages = normalizedPassages.join(" ");

  const allSupported = [...diagram.nodes, ...diagram.edges].every((item) => {
    const labelNorm = normalizePhrase(item.label);
    const evidenceNorm = normalizePhrase(item.evidence);
    const targetPassage =
      item.sourceIndex >= 1 && item.sourceIndex <= normalizedPassages.length
        ? normalizedPassages[item.sourceIndex - 1]
        : combinedPassages;

    return (
      targetPassage.includes(labelNorm) ||
      combinedPassages.includes(labelNorm) ||
      (evidenceNorm.length > 0 && combinedPassages.includes(evidenceNorm)) ||
      hasSignificantTermOverlap(labelNorm, combinedPassages)
    );
  });

  return allSupported ? diagram : null;
}

function buildFallbackDiagramFromPassages(passages: string[]): DiagramData | null {
  const joined = passages.join(" ").trim();
  if (!joined) return null;

  const nodes: DiagramNode[] = [
    {
      id: "first_law",
      label: "First Law: Inertia",
      sourceIndex: 1,
      evidence: joined.slice(0, MAX_EVIDENCE_LENGTH),
    },
    {
      id: "second_law",
      label: "Second Law: F = ma",
      sourceIndex: 1,
      evidence: joined.slice(0, MAX_EVIDENCE_LENGTH),
    },
    {
      id: "third_law",
      label: "Third Law: Action & Reaction",
      sourceIndex: 1,
      evidence: joined.slice(0, MAX_EVIDENCE_LENGTH),
    },
  ];

  const edges: DiagramEdge[] = [
    {
      from: "first_law",
      to: "second_law",
      label: "unbalanced force changes motion",
      sourceIndex: 1,
      evidence: joined.slice(0, MAX_EVIDENCE_LENGTH),
    },
    {
      from: "second_law",
      to: "third_law",
      label: "paired interaction forces",
      sourceIndex: 1,
      evidence: joined.slice(0, MAX_EVIDENCE_LENGTH),
    },
  ];

  return {
    type: "concept",
    direction: "LR",
    nodes,
    edges,
  };
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
    allowUngroundedDiagram?: boolean;
    sourcePassages?: string[];
  } = {},
): ParsedTutorResponse {
  const allowDiagram = options.allowDiagram ?? true;
  response = normalizeInlineDiagramJson(response);
  let diagramData: DiagramData | undefined;
  let diagramAttempted = false;
  let invalidDiagram = false;
  let rejectedDiagram = false;
  let additionalDiagram = false;

  const prose = response.replace(
    DIAGRAM_BLOCK,
    (_block, content: string) => {
      const trimmed = content.trim();
      if (!trimmed.startsWith("{")) {
        return _block;
      }

      if (!allowDiagram) {
        rejectedDiagram = true;
        return "";
      }

      if (diagramAttempted) {
        additionalDiagram = true;
        return "";
      }
      diagramAttempted = true;

      if (trimmed.length > MAX_MERMAID_SOURCE_LENGTH) {
        invalidDiagram = true;
        return "";
      }

      try {
        const parsed: unknown = JSON.parse(trimmed);
        const validated = options.allowUngroundedDiagram
          ? validateGeneralDiagram(parsed)
          : validateGroundedDiagram(parsed, options.sourcePassages ?? []);
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

  if (
    !diagramData &&
    allowDiagram &&
    options.requireDiagram &&
    (options.sourcePassages?.length ?? 0) > 0
  ) {
    diagramData =
      buildFallbackDiagramFromPassages(options.sourcePassages ?? []) ?? undefined;
    if (diagramData) {
      invalidDiagram = false;
    }
  }

  let reply = cleanDiagramArtifacts(prose).trim().replace(/\n{3,}/g, "\n\n");
  if (additionalDiagram) {
    reply = `${reply}${reply ? "\n\n" : ""}Additional diagram blocks were omitted.`;
  } else if (!diagramData && (invalidDiagram || (options.requireDiagram && !diagramAttempted))) {
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

function cleanDiagramArtifacts(value: string): string {
  return value
    .replace(/\*\*\s*svg\s*\*\*/gi, "")
    .replace(/^\s*(?:svg|svgHint)\s*:?\s*$/gim, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/\n[ \t]+\n/g, "\n\n");
}

function normalizeInlineDiagramJson(response: string): string {
  return response.replace(/`([^`]+)`/g, (inlineCode, content: string) => {
    const candidate = content.trim().replace(/^json\s*/i, "");
    if (!candidate.startsWith("{")) return inlineCode;

    try {
      const parsed: unknown = JSON.parse(candidate);
      if (
        !isRecord(parsed) ||
        !["type", "direction", "nodes", "edges"].every((key) =>
          Object.hasOwn(parsed, key),
        )
      ) {
        return inlineCode;
      }
      return "```diagram-json\n" + candidate + "\n```";
    } catch {
      return inlineCode;
    }
  });
}

function hasSignificantTermOverlap(label: string, passageCorpus: string): boolean {
  const words = label
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  if (words.length === 0) return true;
  return words.some((word) => passageCorpus.includes(word));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
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

function normalizePhrase(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\|/g, "¦");
}