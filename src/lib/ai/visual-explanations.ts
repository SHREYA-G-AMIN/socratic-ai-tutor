export type DiagramRequest = "none" | "optional" | "required";
export type DiagramType = "flowchart" | "concept";
export type DiagramDirection = "TD" | "LR";
export type DiagramConstraint =
  | { kind: "gantt" }
  | { kind: "ready-queue"; requestedTime?: number };

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
  /\b(?:draw|create|make|show|generate|provide|include|want|visualize|visualise|map out)\b.{0,60}\b(?:diagrams?|daigrams?|flowchart|concept map|process map|gantt(?:\s+chart)?|visual(?:\s+explanation)?)\b|\b(?:flowchart|concept map|process map|gantt\s+chart)\s+(?:of|for|showing)\b/i;
const EXPLICIT_DIAGRAM_DECLINE =
  /\b(?:don't|do not|never)\s+(?:want|need|include|show|generate|create|make|draw|provide)\b.{0,60}\b(?:diagrams?|daigrams?|flowchart|concept map|process map|gantt(?:\s+chart)?|visual(?:\s+explanation)?)\b/i;
const DIAGRAM_WORTHY_QUESTION =
  /\b(?:steps?|stages?|sequence|cycle|workflow|pathway|life cycle|relationship between|how (?:does|do|is|are)\b.*\bwork)\b/i;
const DIAGRAM_BLOCK = /```(?:diagram-json|json|mermaid)?[^\n]*\r?\n([\s\S]*?)```/gi;
const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function getDiagramRequest(message: string): DiagramRequest {
  if (EXPLICIT_DIAGRAM_DECLINE.test(message)) {
    return "none";
  }

  if (EXPLICIT_DIAGRAM_REQUEST.test(message)) {
    return "required";
  }

  return DIAGRAM_WORTHY_QUESTION.test(message) ? "optional" : "none";
}

export function getDiagramConstraint(message: string): DiagramConstraint | undefined {
  if (/\b(?:gantt(?:\s+chart)?|scheduling timeline)\b/i.test(message)) {
    return { kind: "gantt" };
  }

  if (/\bready[-\s]+queue\b/i.test(message)) {
    const timeMatch = message.match(
      /\b(?:at\s+)?(?:time\s*=?\s*|t\s*=?\s*)(\d+(?:\.\d+)?)/i,
    );
    return {
      kind: "ready-queue",
      ...(timeMatch ? { requestedTime: Number(timeMatch[1]) } : {}),
    };
  }

  return undefined;
}

export function getDiagramConstraintInstructions(
  constraint: DiagramConstraint | undefined,
): string {
  if (constraint?.kind === "gantt") {
    return "For this Gantt chart, use one node per CPU slice. Each node must state the exact process ID and start-end interval quoted in the retrieved passages. Include all evidenced slices in chronological order and connect each slice only to its chronological successor. Do not infer missing intervals or fill gaps.";
  }

  if (constraint?.kind === "ready-queue") {
    const requestedTime =
      constraint.requestedTime === undefined
        ? ""
        : ` at time ${constraint.requestedTime}`;
    return `For this ready-queue diagram${requestedTime}, use only an explicit ready-queue snapshot in the retrieved passages. Put the time in one header node and the process IDs in separate nodes in the exact queue order; connect the header to the front process and each process to the next. If the requested state or order is not explicitly supported, omit the diagram.`;
  }

  return "";
}

export function isExplicitGeneralDiagramRequest(message: string): boolean {
  const explicitlyGeneral =
    /\b(?:general|in general|on (?:your|ur) own|by yourself|outside (?:the )?(?:document|pdf|material)|not (?:from|based on) (?:the )?(?:document|pdf|material)|use (?:your )?(?:general )?knowledge)\b/i.test(
      message,
    );
  return explicitlyGeneral && getDiagramRequest(message) === "required";
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

  const outputContract = `Return a fenced \`\`\`diagram-json block containing strict JSON with this shape: {"type":"flowchart"|"concept","direction":"TD"|"LR","nodes":[{"id":"stable_id","label":"short label","sourceIndex":1,"evidence":"short exact quote from passage"}],"edges":[{"from":"node_id","to":"node_id","label":"relationship","sourceIndex":1,"evidence":"short exact quote from passage"}]}. Passage indexes are 1-based and refer to the numbered Context Passages in the latest user request. Include 2-12 nodes and 1-20 labeled edges. Keep labels concise (under 80 chars) and use valid node IDs matching /^[A-Za-z][A-Za-z0-9_]{0,31}$/. Base all course facts on the retrieved passages. Design the diagram to answer the student's exact request, not merely name the topic. For a documented worked example, preserve its actual values and execution order. For a scheduling timeline, make one connected node per CPU time slice, label each with its process and duration (and cumulative time boundaries when derivable), then connect the slices chronologically. Do not replace a worked example or timeline with generic concept labels; use its actual values and steps, not generic concept labels. Every node must participate in at least one edge unless it is an explicit start or end node. Use an exact, case-sensitive evidence quote in every evidence field.`;

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
      typeof candidate.id === "string" ? candidate.id.trim() : "";
    const rawLabel =
      typeof candidate.label === "string" ? candidate.label.trim() : "";

    if (
      !NODE_ID_PATTERN.test(rawId) ||
      nodeById.has(rawId) ||
      !isBoundedText(rawLabel, MAX_DIAGRAM_LABEL_LENGTH)
    ) {
      return null;
    }

    const sourceIndex = isSourceIndex(candidate.sourceIndex)
      ? candidate.sourceIndex
      : 1;
    const evidence =
      typeof candidate.evidence === "string" && candidate.evidence.trim().length > 0
        ? candidate.evidence.trim()
        : rawLabel;
    if (evidence.length > MAX_EVIDENCE_LENGTH) {
      return null;
    }

    const node: DiagramNode = {
      id: rawId,
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
      return null;
    }

    const from = nodeById.get(candidate.from.trim());
    const to = nodeById.get(candidate.to.trim());
    if (!from || !to) {
      return null;
    }

    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!isBoundedText(label, MAX_DIAGRAM_LABEL_LENGTH)) {
      return null;
    }
    const sourceIndex = isSourceIndex(candidate.sourceIndex)
      ? candidate.sourceIndex
      : 1;
    const evidence =
      typeof candidate.evidence === "string" && candidate.evidence.trim().length > 0
        ? candidate.evidence.trim()
        : `${from.label} ${label} ${to.label}`.slice(0, MAX_EVIDENCE_LENGTH);
    if (evidence.length > MAX_EVIDENCE_LENGTH) {
      return null;
    }

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

  const connectedNodeIds = new Set(
    edges.flatMap((edge) => [edge.from, edge.to]),
  );
  if (
    nodes.some(
      (node) =>
        !connectedNodeIds.has(node.id) &&
        !/^(?:start|end)(?:_node)?$/i.test(node.id) &&
        !/^(?:start|end)(?: node)?$/i.test(node.label),
    )
  ) {
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
  constraint?: DiagramConstraint,
): DiagramData | null {
  if (!hasCompleteGroundingMetadata(value)) {
    return null;
  }

  const diagram = validateDiagramStructure(value);
  if (!diagram) {
    return null;
  }

  if (constraint?.kind === "gantt") {
    return validateGanttDiagram(diagram, passages);
  }

  if (constraint?.kind === "ready-queue") {
    return validateReadyQueueDiagram(diagram, passages, constraint.requestedTime);
  }

  const allSupported = [...diagram.nodes, ...diagram.edges].every((item) => {
    const labelNorm = normalizePhrase(item.label);
    const evidenceNorm = normalizePhrase(item.evidence);
    const targetPassage =
      item.sourceIndex >= 1 && item.sourceIndex <= passages.length
        ? passages[item.sourceIndex - 1]
        : "";

    // Provenance must point to an exact quote in the cited passage, not merely
    // to a vaguely similar passage elsewhere in the retrieved context.
    if (
      !evidenceNorm ||
      !normalizeWhitespace(targetPassage).includes(
        normalizeWhitespace(item.evidence),
      )
    ) {
      return false;
    }

    // Every meaningful label term must be present in that quoted evidence.
    // This blocks unrelated diagrams that happen to share one generic word.
    const labelTerms = labelNorm.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
    const evidenceTerms = new Set(evidenceNorm.split(/[^a-z0-9]+/));
    return labelTerms.length > 0 && labelTerms.every((word) => evidenceTerms.has(word));
  });

  const nodesById = new Map<string, DiagramNode>(
    diagram.nodes.map((node) => [node.id, node]),
  );
  const relationshipsSupported = diagram.edges.every((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    return (
      from !== undefined &&
      to !== undefined &&
      hasOrderedRelationship(from.label, edge.label, to.label, edge.evidence)
    );
  });

  return allSupported && relationshipsSupported ? diagram : null;
}

function validateGanttDiagram(
  diagram: DiagramData,
  passages: string[],
): DiagramData | null {
  if (diagram.type !== "flowchart" || diagram.nodes.length < 2) {
    return null;
  }

  const expectedSlices = new Map<string, GanttSlice>();
  for (const passage of passages) {
    for (const slice of extractGanttSlices(passage)) {
      if (slice.start < 0 || slice.end <= slice.start) {
        return null;
      }
      expectedSlices.set(getGanttSliceKey(slice), slice);
    }
  }

  const expected = [...expectedSlices.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const actual = diagram.nodes.map((node) => parseGanttSliceLabel(node.label));
  if (
    expected.length !== diagram.nodes.length ||
    actual.some((slice) => slice === null) ||
    actual.some(
      (slice, index) =>
        slice === null ||
        getGanttSliceKey(slice) !== getGanttSliceKey(expected[index]),
    )
  ) {
    return null;
  }

  for (let index = 0; index < diagram.nodes.length; index++) {
    const node = diagram.nodes[index];
    const slice = actual[index];
    if (
      slice === null ||
      !hasExactEvidence(node, passages) ||
      !extractGanttSlices(node.evidence).some(
        (evidenceSlice) =>
          getGanttSliceKey(evidenceSlice) === getGanttSliceKey(slice),
      ) ||
      (index > 0 && slice.start < (actual[index - 1]?.end ?? 0))
    ) {
      return null;
    }
  }

  if (diagram.edges.length !== diagram.nodes.length - 1) {
    return null;
  }

  for (let index = 0; index < diagram.edges.length; index++) {
    const edge = diagram.edges[index];
    const previousSlice = actual[index];
    const nextSlice = actual[index + 1];
    if (
      !previousSlice ||
      !nextSlice ||
      edge.from !== diagram.nodes[index].id ||
      edge.to !== diagram.nodes[index + 1].id ||
      edge.label.toLocaleLowerCase() !== "next" ||
      !hasExactEvidence(edge, passages) ||
      !extractGanttSlices(edge.evidence).some(
        (slice) => getGanttSliceKey(slice) === getGanttSliceKey(previousSlice),
      ) ||
      !extractGanttSlices(edge.evidence).some(
        (slice) => getGanttSliceKey(slice) === getGanttSliceKey(nextSlice),
      )
    ) {
      return null;
    }
  }

  return diagram;
}

function validateReadyQueueDiagram(
  diagram: DiagramData,
  passages: string[],
  requestedTime?: number,
): DiagramData | null {
  if (diagram.type !== "flowchart" || diagram.nodes.length < 2) {
    return null;
  }

  const snapshots = new Map<string, ReadyQueueSnapshot>();
  for (const passage of passages) {
    for (const snapshot of extractReadyQueueSnapshots(passage)) {
      const key = `${snapshot.time}:${snapshot.processes.join(",")}`;
      snapshots.set(key, snapshot);
    }
  }

  const matchingSnapshots = [...snapshots.values()].filter(
    (snapshot) => requestedTime === undefined || snapshot.time === requestedTime,
  );
  if (matchingSnapshots.length !== 1) {
    return null;
  }

  const snapshot = matchingSnapshots[0];
  const header = diagram.nodes[0];
  const headerTime = header.label.match(/^Ready queue at t=(\d+(?:\.\d+)?)$/i);
  if (
    !headerTime ||
    Number(headerTime[1]) !== snapshot.time ||
    diagram.nodes.length !== snapshot.processes.length + 1 ||
    !hasQueueEvidence(header, snapshot, passages)
  ) {
    return null;
  }

  for (let index = 0; index < snapshot.processes.length; index++) {
    const processNode = diagram.nodes[index + 1];
    if (
      processNode.label !== snapshot.processes[index] ||
      !hasQueueEvidence(processNode, snapshot, passages)
    ) {
      return null;
    }
  }

  if (diagram.edges.length !== snapshot.processes.length) {
    return null;
  }

  for (let index = 0; index < diagram.edges.length; index++) {
    const edge = diagram.edges[index];
    const expectedFrom = diagram.nodes[index].id;
    const expectedTo = diagram.nodes[index + 1].id;
    const expectedLabel = index === 0 ? "front" : "next";
    if (
      edge.from !== expectedFrom ||
      edge.to !== expectedTo ||
      edge.label.toLocaleLowerCase() !== expectedLabel ||
      !hasQueueEvidence(edge, snapshot, passages)
    ) {
      return null;
    }
  }

  return diagram;
}

interface GanttSlice {
  processId: string;
  start: number;
  end: number;
}

interface ReadyQueueSnapshot {
  time: number;
  processes: string[];
}

function parseGanttSliceLabel(value: string): GanttSlice | null {
  const match = value.match(
    /^\s*(P\d+)\s*[\[(]?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*[\])]?\s*$/i,
  );
  if (!match) {
    return null;
  }

  return {
    processId: match[1],
    start: Number(match[2]),
    end: Number(match[3]),
  };
}

function extractGanttSlices(value: string): GanttSlice[] {
  const slices: GanttSlice[] = [];
  const pattern =
    /\b(P\d+)\s*[\[(:]?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*[\])]?\b/gi;
  for (const match of value.matchAll(pattern)) {
    slices.push({
      processId: match[1],
      start: Number(match[2]),
      end: Number(match[3]),
    });
  }
  return slices;
}

function getGanttSliceKey(slice: GanttSlice): string {
  return `${slice.processId}:${slice.start}-${slice.end}`;
}

function extractReadyQueueSnapshots(value: string): ReadyQueueSnapshot[] {
  const patterns = [
    /\bat\s+(?:time\s+)?t?\s*=?\s*(\d+(?:\.\d+)?)\s*[,;:]?\s*(?:the\s+)?ready\s+queue\s*(?:is|:|=)\s*((?:P\d+)(?:\s*(?:,|then|->)\s*P\d+)*)/gi,
    /\bready\s+queue\s+at\s+(?:time\s+)?t?\s*=?\s*(\d+(?:\.\d+)?)\s*(?:is|:|=)\s*((?:P\d+)(?:\s*(?:,|then|->)\s*P\d+)*)/gi,
  ];
  const snapshots: ReadyQueueSnapshot[] = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const processes = match[2].match(/\bP\d+\b/g) ?? [];
      if (processes.length > 0 && new Set(processes).size === processes.length) {
        snapshots.push({ time: Number(match[1]), processes });
      }
    }
  }
  return snapshots;
}

function hasQueueEvidence(
  item: DiagramNode | DiagramEdge,
  snapshot: ReadyQueueSnapshot,
  passages: string[],
): boolean {
  return (
    hasExactEvidence(item, passages) &&
    extractReadyQueueSnapshots(item.evidence).some(
      (candidate) =>
        candidate.time === snapshot.time &&
        candidate.processes.join(",") === snapshot.processes.join(","),
    )
  );
}

function hasExactEvidence(
  item: DiagramNode | DiagramEdge,
  passages: string[],
): boolean {
  const passage = passages[item.sourceIndex - 1];
  return (
    passage !== undefined &&
    normalizeWhitespace(passage).includes(normalizeWhitespace(item.evidence))
  );
}

function hasCompleteGroundingMetadata(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  ) {
    return false;
  }

  return [...value.nodes, ...value.edges].every(
    (item) =>
      isRecord(item) &&
      isSourceIndex(item.sourceIndex) &&
      typeof item.evidence === "string" &&
      item.evidence.trim().length > 0 &&
      item.evidence.trim().length <= MAX_EVIDENCE_LENGTH,
  );
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
    diagramConstraint?: DiagramConstraint;
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
    (block, content: string) => {
      const trimmed = content.trim();
      if (/^```mermaid\b/i.test(block.trimStart())) {
        invalidDiagram = true;
        return "";
      }

      if (!trimmed.startsWith("{")) {
        return block;
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
          : validateGroundedDiagram(
              parsed,
              options.sourcePassages ?? [],
              options.diagramConstraint,
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

  if (
    !diagramData &&
    allowDiagram &&
    options.requireDiagram &&
    (options.sourcePassages?.length ?? 0) > 0
  ) {
    // Never invent a generic diagram when the model output is missing or invalid.
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
    .replace(/^\s*(?:(?:\*\*|__)\s*)?(?:svgHint|svg)\s*(?:(?:\*\*|__)\s*)?:?\s*$/gim, "")
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

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasOrderedRelationship(
  fromLabel: string,
  relationshipLabel: string,
  toLabel: string,
  evidence: string,
): boolean {
  const tokens: string[] = evidence.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [];
  const findLabelEnd = (label: string, startAt: number): number | null => {
    const terms = label
      .toLocaleLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length >= 3);
    if (!terms || terms.length === 0) {
      return null;
    }

    let cursor = startAt;
    for (const term of terms) {
      const position = tokens.indexOf(term, cursor);
      if (position === -1) {
        return null;
      }
      cursor = position + 1;
    }
    return cursor - 1;
  };

  const fromEnd = findLabelEnd(fromLabel, 0);
  if (fromEnd === null) {
    return false;
  }

  const relationshipEnd = findLabelEnd(relationshipLabel, fromEnd + 1);
  if (relationshipEnd === null) {
    return false;
  }

  return findLabelEnd(toLabel, relationshipEnd + 1) !== null;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\|/g, "¦");
}