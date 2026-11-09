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

export function parseTutorResponse(
  response: string,
  options: { allowDiagram?: boolean } = {},
): ParsedTutorResponse {
  const allowDiagram = options.allowDiagram ?? true;
  let diagram: string | undefined;
  let rejectedDiagram = false;
  let diagramTooLong = false;
  let additionalDiagram = false;
  const prose = response.replace(MERMAID_FENCE, (fence, source: string) => {
    if (!allowDiagram) {
      rejectedDiagram = true;
      return "";
    }

    if (diagram !== undefined || rejectedDiagram || diagramTooLong) {
      additionalDiagram = true;
      return "";
    }

    if (source.trim().length > MAX_MERMAID_SOURCE_LENGTH) {
      diagramTooLong = true;
      return "";
    }

    if (source.trim()) {
      diagram = source.trim();
    } else {
      additionalDiagram = true;
    }

    return "";
  });
  let reply = prose.trim().replace(/\n{3,}/g, "\n\n");
  if (additionalDiagram) {
    reply = `${reply}${reply ? "\n\n" : ""}Additional diagram blocks were omitted.`;
  } else if (diagramTooLong) {
    reply = `${reply}${reply ? "\n\n" : ""}The diagram was too long to display.`;
  }

  return {
    reply:
      reply ||
      (diagram
        ? "Here is a visual explanation based on the retrieved passages."
        : rejectedDiagram
          ? "The retrieved passages do not support a reliable diagram for this request."
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
