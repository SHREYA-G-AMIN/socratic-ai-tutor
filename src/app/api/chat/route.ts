import { NextResponse } from "next/server";
import {
  detectTutoringIntent,
  getTutorInstructions,
} from "@/lib/ai/tutoring-intent";
import { detectConfusion } from "@/lib/ai/confusion-detection";
import {
  MAX_MERMAID_SOURCE_LENGTH,
  getDiagramRequest,
  parseTutorResponse,
} from "@/lib/ai/visual-explanations";
import { EmbeddingProviderError } from "@/lib/documents/embeddings";
import { chunkText } from "@/lib/documents/chunker";
import {
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
} from "@/lib/documents/constants";
import {
  getContentQueryTerms,
  retrieveRelevantChunks,
  retrieveSemanticallyRelevantChunks,
  type RetrievalResult,
} from "@/lib/documents/retrieval";
import type { DocumentPageRange } from "@/types/document";
import type { ChatResponse, ChatSourceReference } from "@/types/chat";

const MAX_RETRIEVED_CHUNKS = 3;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_TURNS = 12;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const GEMINI_CHAT_MODEL = "gemini-3.5-flash-lite";
const GEMINI_GENERATE_API =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { message, documentText } = body;
    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > MAX_MESSAGE_LENGTH ||
      typeof documentText !== "string" ||
      documentText.length === 0 ||
      documentText.length > MAX_EXTRACTED_CHARACTERS
    ) {
      return NextResponse.json(
        { error: "A valid message and document text are required" },
        { status: 400 },
      );
    }

    const currentMessage = message.trim();
    const intent = detectTutoringIntent(currentMessage);
    const history = parseChatHistory(body.history);
    const retrievalMessage = buildRetrievalMessage(currentMessage, history);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI services are not configured. Set GEMINI_API_KEY on the server." },
        { status: 503 },
      );
    }

    const chunks = chunkText(documentText, {
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    if (chunks.length === 0) {
      return NextResponse.json({
        reply: "No document content available to search.",
        sources: [],
        retrievalMode: "keyword",
      } satisfies ChatResponse);
    }

    const pageRanges = parsePageRanges(body.pageRanges, documentText.length);
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim().slice(0, 255)
        : null;

    let retrievalMode: ChatResponse["retrievalMode"] = "semantic";
    let warning: string | undefined;
    let relevant: RetrievalResult[];

    try {
      relevant = await retrieveSemanticallyRelevantChunks(
        chunks,
        retrievalMessage,
        {
          maxResults: MAX_RETRIEVED_CHUNKS,
          pageRanges,
          requireLexicalCorroboration: intent !== "summary",
        },
      );
      if (intent === "summary" && relevant.length === 0) {
        retrievalMode = "keyword";
        warning =
          "Semantic retrieval found no passages. Using document-order passages for the summary.";
        relevant = retrieveRelevantChunks(
          chunks,
          currentMessage,
          MAX_RETRIEVED_CHUNKS,
          pageRanges,
          { minimumMatches: 0 },
        );
      }
    } catch (error) {
      retrievalMode = "keyword";
      warning =
        error instanceof EmbeddingProviderError
          ? error.message
          : "Semantic retrieval is unavailable. Showing keyword matches instead.";
      console.error(
        "[api/chat] semantic retrieval unavailable; using keyword fallback",
        error instanceof EmbeddingProviderError ? error.code : "UNKNOWN_ERROR",
      );
      relevant = retrieveRelevantChunks(
        chunks,
        retrievalMessage,
        MAX_RETRIEVED_CHUNKS,
        pageRanges,
        { minimumMatches: intent === "summary" ? 0 : undefined },
      );
    }

    // If the student is answering or replying inside an ongoing Socratic turn
    // and direct retrieval comes up empty, fall back to the prior topic context
    // or document-order passages so the tutor can evaluate their answer.
    if (relevant.length === 0 && history.length > 0 && isActiveTutorReply(currentMessage)) {
      const priorContextQuery = getLastTopicQuery(history);
      if (priorContextQuery) {
        try {
          relevant = await retrieveSemanticallyRelevantChunks(
            chunks,
            priorContextQuery,
            {
              maxResults: MAX_RETRIEVED_CHUNKS,
              pageRanges,
              requireLexicalCorroboration: false,
            },
          );
        } catch {
          relevant = retrieveRelevantChunks(
            chunks,
            priorContextQuery,
            MAX_RETRIEVED_CHUNKS,
            pageRanges,
            { minimumMatches: 0 },
          );
        }
      }
      if (relevant.length === 0) {
        relevant = retrieveRelevantChunks(
          chunks,
          currentMessage,
          MAX_RETRIEVED_CHUNKS,
          pageRanges,
          { minimumMatches: 0 },
        );
      }
    }

    const sources: ChatSourceReference[] = relevant.map((result) => ({
      fileName,
      chunkIndex: result.index,
      startChar: result.start,
      endChar: result.end,
      pageNumbers: result.pageNumbers,
      text: result.chunk,
      score: result.score,
    }));

    const diagramRequest = getDiagramRequest(currentMessage);
    const documentOnlyDiagramRequest =
      isDocumentOnlyDiagramRequest(currentMessage);
    const generalDiagramRequest =
      !documentOnlyDiagramRequest &&
      (isGeneralDiagramRequest(currentMessage) ||
        (diagramRequest === "required" &&
          history.length > 0 &&
          sources.length === 0));

    if (sources.length === 0 && !generalDiagramRequest) {
      return NextResponse.json({
        reply:
          "I couldn't find supporting information for that question in the uploaded material.",
        sources,
        retrievalMode,
        ...(warning ? { warning } : {}),
      } satisfies ChatResponse);
    }

    const contextText =
      sources.length > 0
        ? sources
            .map((source, index) => {
              const location =
                source.pageNumbers.length > 0
                  ? `Pages ${source.pageNumbers.join(", ")}`
                  : `Text offsets ${source.startChar}-${source.endChar}`;
              return `Passage ${index + 1} (${location}):\n${source.text}`;
            })
            .join("\n\n")
        : "No uploaded-document passages were retrieved. The student explicitly requested a general-knowledge diagram.";
    const prompt = `Context Passages:\n${contextText}\n\nUser Question: ${currentMessage}`;

    const contents = [...history, { role: "user" as const, parts: [{ text: prompt }] }];
    while (contents.length > 1 && contents[0].role === "model") {
      contents.shift();
    }

    const confusion = detectConfusion(
      currentMessage,
      history.map((turn) => ({
        role: turn.role === "user" ? "student" : "tutor",
        text: turn.parts.map((part) => part.text).join(""),
      })),
    );
    const baseInstructions = getTutorInstructions(
      intent,
      confusion.severity,
      generalDiagramRequest ? "none" : diagramRequest,
      true,
    );
    const tutorInstructions = generalDiagramRequest
      ? `${baseInstructions}

GENERAL-KNOWLEDGE DIAGRAM OVERRIDE: The student asked for a diagram and no relevant document passages were found, or explicitly asked you to use general knowledge. For the diagram only, use reliable general knowledge about the topic in the recent conversation. Do not claim it came from the PDF and do not cite the PDF. Clearly label it as a general explanation. Return exactly one diagram-json block with strict JSON and exactly this shape: {"type":"flowchart"|"concept","direction":"TD"|"LR","nodes":[{"id":"user","label":"User"}],"edges":[{"from":"user","to":"application","label":"uses"}]}. Use 2-12 nodes and 1-20 edges. Node objects must contain only id and label; edge objects only from, to, and label. Labels must be concise, factual, and safe for Mermaid. Do not include sourceIndex or evidence fields. Do not output SVG, HTML, Mermaid syntax, or a separate diagram description. The only diagram representation must be the single diagram-json block. Do not omit the diagram block. Keep prose brief.`
      : baseInstructions;
    const generatedResponse = await generateTutorReply(
      apiKey,
      contents,
      tutorInstructions,
      generalDiagramRequest,
    );
    const normalizedResponse = generalDiagramRequest
      ? normalizeGeneralDiagramResponse(generatedResponse)
      : generatedResponse;
    const tutorResponse = parseTutorResponse(normalizedResponse, {
      allowDiagram: generalDiagramRequest || (diagramRequest !== "none" && sources.length > 0),
      requireDiagram: diagramRequest === "required",
      allowUngroundedDiagram: generalDiagramRequest,
      sourcePassages: sources.map((source) => source.text),
    });

    return NextResponse.json({
      ...tutorResponse,
      diagramIsGeneral: Boolean(generalDiagramRequest && tutorResponse.diagramData),
      sources,
      retrievalMode,
      ...(warning ? { warning } : {}),
    } satisfies ChatResponse);
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface GeminiHistoryMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

function isActiveTutorReply(message: string): boolean {
  const isNewTopicQuestion =
    /^(?:what|who|where|when|which|define|explain|compare|summarize|summarise)\b/i.test(
      message.trim(),
    ) && getContentQueryTerms(message).length >= 2;
  return !isNewTopicQuestion;
}

function getLastTopicQuery(history: GeminiHistoryMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === "user") {
      const text = turn.parts.map((part) => part.text).join("").trim();
      if (getContentQueryTerms(text).length > 0) {
        return text;
      }
    }
  }
  return null;
}

function buildRetrievalMessage(
  message: string,
  history: GeminiHistoryMessage[],
): string {
  const isContextDependentFollowUp =
    /\b(?:hint|help|stuck|confused|clue|nudge|try again|due to|because)\b/i.test(message) ||
    getContentQueryTerms(message).length <= 2;

  if (!isContextDependentFollowUp) {
    return message;
  }

  const priorStudentMessage = [...history]
    .reverse()
    .find(
      (turn) =>
        turn.role === "user" &&
        getContentQueryTerms(turn.parts.map((part) => part.text).join("")).length > 0,
    );

  return priorStudentMessage
    ? `${priorStudentMessage.parts.map((part) => part.text).join("")}\n${message}`
    : message;
}

function parseChatHistory(value: unknown): GeminiHistoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (message): message is Record<string, unknown> =>
        isRecord(message) &&
        (message.role === "student" ||
          message.role === "tutor" ||
          message.role === "hint"),
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((message): GeminiHistoryMessage => {
      const role: GeminiHistoryMessage["role"] =
        message.role === "student" ? "user" : "model";

      const diagram =
        typeof message.diagram === "string"
          ? `\n\nPrevious visual explanation (Mermaid):\n${message.diagram.slice(0, MAX_MERMAID_SOURCE_LENGTH)}`
          : "";

      return {
        role,
        parts: [
          {
            text:
              `${typeof message.text === "string" ? message.text.slice(0, MAX_MESSAGE_LENGTH) : ""}${diagram}`,
          },
        ],
      };
    })
    .filter((message) => message.parts[0].text.length > 0);
}

async function generateTutorReply(
  apiKey: string,
  contents: GeminiHistoryMessage[],
  tutorInstructions: string,
  requireStructuredDiagram = false,
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(
      `${GEMINI_GENERATE_API}/${GEMINI_CHAT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: tutorInstructions }] },
          contents,
          ...(requireStructuredDiagram
            ? {
                generationConfig: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: "OBJECT",
                    properties: {
                      reply: { type: "STRING" },
                      diagram: {
                        type: "OBJECT",
                        properties: {
                          type: { type: "STRING", enum: ["flowchart", "concept"] },
                          direction: { type: "STRING", enum: ["TD", "LR"] },
                          nodes: {
                            type: "ARRAY",
                            items: {
                              type: "OBJECT",
                              properties: {
                                id: { type: "STRING" },
                                label: { type: "STRING" },
                              },
                              required: ["id", "label"],
                            },
                          },
                          edges: {
                            type: "ARRAY",
                            items: {
                              type: "OBJECT",
                              properties: {
                                from: { type: "STRING" },
                                to: { type: "STRING" },
                                label: { type: "STRING" },
                              },
                              required: ["from", "to", "label"],
                            },
                          },
                        },
                        required: ["type", "direction", "nodes", "edges"],
                      },
                    },
                    required: ["reply", "diagram"],
                  },
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    throw new Error("The AI tutor could not be reached. Please try again.");
  }

  if (!response.ok) {
    throw new Error("The AI tutor could not process the request. Please try again.");
  }

  let result: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  try {
    result = await response.json();
  } catch {
    throw new Error("The AI tutor returned an invalid response.");
  }

  const reply = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!reply) {
    throw new Error("The AI tutor returned an empty response.");
  }

  return reply;
}

function normalizeGeneralDiagramResponse(response: string): string {
  try {
    const parsed: unknown = JSON.parse(response);
    if (
      !isRecord(parsed) ||
      typeof parsed.reply !== "string" ||
      !isRecord(parsed.diagram)
    ) {
      return response;
    }
    return [
      parsed.reply.trim(),
      "```diagram-json",
      JSON.stringify(parsed.diagram),
      "```",
    ].filter(Boolean).join("\n\n");
  } catch {
    return response;
  }
}

function isDocumentOnlyDiagramRequest(message: string): boolean {
  return (
    /\b(?:based|drawn|generated)\s+only\s+on\s+(?:the\s+)?(?:my\s+)?(?:uploaded\s+)?(?:document|pdf|material)\b/i.test(
      message,
    ) ||
    /\buse\s+only\s+(?:the\s+)?(?:my\s+)?(?:uploaded\s+)?(?:document|pdf|material)\b/i.test(
      message,
    ) ||
    /\bonly\s+from\s+(?:the\s+)?(?:my\s+)?(?:uploaded\s+)?(?:document|pdf|material)\b/i.test(
      message,
    )
  );
}

function isGeneralDiagramRequest(message: string): boolean {
  const explicitlyGeneral =
    /\b(?:general|in general|on (?:your|ur) own|by yourself|outside (?:the )?(?:document|pdf|material)|not (?:from|based on) (?:the )?(?:document|pdf|material)|use (?:your )?(?:general )?knowledge)\b/i.test(message);
  const asksForDiagram =
    /\b(?:diagrams?|daigrams?|draw|visual|flowchart|concept map)\b/i.test(message);
  return explicitlyGeneral && asksForDiagram;
}

function parsePageRanges(
  value: unknown,
  documentLength: number,
): DocumentPageRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_PDF_PAGES)
    .filter(
      (range): range is DocumentPageRange =>
        isRecord(range) &&
        typeof range.pageNumber === "number" &&
        Number.isInteger(range.pageNumber) &&
        range.pageNumber >= 1 &&
        range.pageNumber <= MAX_PDF_PAGES &&
        typeof range.startChar === "number" &&
        Number.isInteger(range.startChar) &&
        range.startChar >= 0 &&
        typeof range.endChar === "number" &&
        Number.isInteger(range.endChar) &&
        range.endChar > range.startChar &&
        range.endChar <= documentLength,
    )
    .map((range) => ({
      pageNumber: range.pageNumber,
      startChar: range.startChar,
      endChar: range.endChar,
    }));
}