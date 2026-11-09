export type DiagramRequest = "none" | "optional" | "required";

export interface ParsedTutorResponse {
  reply: string;
  diagram?: string;
}

export type MermaidRenderResult =
  | { kind: "rendered"; svg: string }
  | { kind: "fallback"; source: string };

export const MAX_MERMAID_SOURCE_LENGTH = 8_000;

const EXPLICIT_DIAGRAM_REQUEST =
  /\b(?:diagram|flowchart|concept map|process map|visual(?:ly|ization|isation)?|draw|map out)\b/i;
const DIAGRAM_WORTHY_QUESTION =
  /\b(?:steps?|stages?|sequence|process|cycle|workflow|pathway|life cycle|relationship between|how (?:does|do|is|are)\b.*\bwork)\b/i;
const MERMAID_FENCE = /```mermaid\s*\r?\n([\s\S]*?)```/gi;

export function getDiagramRequest(
  message: string,
): DiagramRequest {
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
    return `No retrieved passages support a course-specific diagram. If the student requested one, explain that the available document passages do not support a reliable visual explanation. Do not invent nodes, steps, or relationships and do not include a Mermaid block.`;
  }

  if (request === "none") {
    return `Do not include a Mermaid diagram in this response. Retrieved passages are the only allowed source for course-specific claims.`;
  }

  if (request === "required") {
    return `The student explicitly requested a visual explanation. Include exactly one concise Mermaid diagram only when all its nodes and relationships are directly supported by the retrieved passages. Use a flowchart, concept map (mindmap), process diagram, or numbered step breakdown as appropriate. Put only valid Mermaid source in a fenced \`\`\`mermaid code block. Keep requested prose and diagram separate. If the passages cannot support a useful diagram, say so without inventing steps or relationships.`;
  }

  return `A diagram may help explain this process or sequence. Include at most one concise Mermaid diagram only if the retrieved passages clearly support its nodes and relationships; otherwise answer normally without a diagram. Put Mermaid source in a fenced \`\`\`mermaid code block and keep explanatory prose outside it.`;
}

export function parseTutorResponse(response: string): ParsedTutorResponse {
  let diagram: string | undefined;
  const prose = response.replace(MERMAID_FENCE, (fence, source: string) => {
    if (diagram === undefined && source.trim()) {
      diagram = source.trim();
      return "";
    }
    return source.trim();
  });
  const reply = prose.trim().replace(/\n{3,}/g, "\n\n");

  return {
    reply:
      reply ||
      (diagram
        ? "Here is a visual explanation based on the retrieved passages."
        : response.trim()),
    ...(diagram ? { diagram } : {}),
  };
}

export async function renderMermaidSafely(
  source: string,
  render: (source: string) => Promise<string>,
): Promise<MermaidRenderResult> {
  if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
    return { kind: "fallback", source };
  }

  try {
    return { kind: "rendered", svg: await render(source) };
  } catch {
    return { kind: "fallback", source };
  }
}
