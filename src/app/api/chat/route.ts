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
import { createClient } from "@/lib/supabase/server";

const MAX_RETRIEVED_CHUNKS = 3;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_TURNS = 12;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const GEMINI_CHAT_MODEL = "gemini-3.5-flash-lite";
const GEMINI_GENERATE_API =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

class TutorProviderError extends Error {
  constructor(
    message: string,
    readonly status: 502 | 503,
  ) {
    super(message);
    this.name = "TutorProviderError";
  }
}

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

    const { message, documentId } = body;
    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > MAX_MESSAGE_LENGTH ||
      typeof documentId !== "string" ||
      !documentId
    ) {
      return NextResponse.json(
        { error: "A valid message and saved document are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,file_name,extracted_text,page_ranges")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (documentError || !document) {
      return NextResponse.json({ error: "The selected document was not found in your account" }, { status: 404 });
    }

    const documentText = document.extracted_text;
    if (
      typeof documentText !== "string" ||
      documentText.length === 0 ||
      documentText.length > MAX_EXTRACTED_CHARACTERS
    ) {
      return NextResponse.json({ error: "The saved document has no usable extracted text" }, { status: 422 });
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

    const pageRanges = parsePageRanges(document.page_ranges, documentText.length);
    const cacheScope = `${user.id}:${document.id}`;
    const fileName = document.file_name;

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
          cacheScope,
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
              cacheScope,
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
    const conversationTopic = [
      currentMessage,
      ...history.filter((turn) => turn.role === "user").map((turn) =>
        turn.parts.map((part) => part.text).join(""),
      ),
    ].join(" ");
    const roundRobinNeedsIllustrativeExample =
      /round\s*robin/i.test(conversationTopic) &&
      !sources.some((source) => /round\s*robin|time quantum|time slice.{0,30}(?:p[1-9]|process)|p[1-9].{0,30}(?:ms|milliseconds)/i.test(source.text));
    const generalDiagramRequest =
      !documentOnlyDiagramRequest &&
      (isGeneralDiagramRequest(currentMessage) ||
        roundRobinNeedsIllustrativeExample ||
        (diagramRequest === "required" &&
          history.length > 0 &&
          sources.length === 0));

    if (sources.length === 0 && !generalDiagramRequest) {
      const noEvidenceReply = "I couldn't find supporting information for that question in the uploaded material.";
      const savedMessages = [
        ...(Array.isArray(body.history) ? body.history.filter((item) =>
          item && typeof item === "object" &&
          ["student", "tutor", "hint"].includes(String((item as { role?: unknown }).role)) &&
          typeof (item as { text?: unknown }).text === "string"
        ).slice(-198) : []),
        { role: "student", text: currentMessage },
        { role: "tutor", text: noEvidenceReply, sources: [] },
      ];
      const firstStudentMessage = savedMessages.find((item) =>
        item && typeof item === "object" && (item as { role?: string }).role === "student"
      ) as { text?: string } | undefined;
      const title = firstStudentMessage?.text?.trim().slice(0, 80) || "New conversation";
      const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : null;
      let conversationId = requestedConversationId;

      if (requestedConversationId) {
        const { data: savedConversation, error: saveError } = await supabase
          .from("conversations")
          .update({ messages: savedMessages, title, updated_at: new Date().toISOString() })
          .eq("id", requestedConversationId)
          .eq("user_id", user.id)
          .eq("document_id", document.id)
          .select("id")
          .maybeSingle();
        if (saveError || !savedConversation) {
          return NextResponse.json({ error: "Could not save this conversation" }, { status: 500 });
        }
      } else {
        const { data: createdConversation, error: createError } = await supabase
          .from("conversations")
          .insert({ user_id: user.id, document_id: document.id, title, messages: savedMessages })
          .select("id")
          .single();
        if (createError || !createdConversation) {
          return NextResponse.json({ error: "Could not save this conversation" }, { status: 500 });
        }
        conversationId = createdConversation.id;
      }

      return NextResponse.json({
        reply: noEvidenceReply,
        sources,
        retrievalMode,
        conversationId,
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

GENERAL-KNOWLEDGE DIAGRAM OVERRIDE: The requested topic or worked-example details are not present in the retrieved document passages, or the student explicitly asked for general knowledge. For the diagram only, use reliable general knowledge about the topic in the recent conversation. Do not claim the illustrative values, steps, or example came from the PDF. Clearly label the diagram and any illustrative example as a general example, separate from the document-supported facts. If the request asks for a timeline or worked example, use a concrete internally consistent example with named processes, a stated quantum, chronological time slices, and cumulative time boundaries. For Round Robin, ensure each slice's process and duration are explicit and show a process returning to the ready queue only when it has remaining burst time. Return exactly one diagram-json block with strict JSON and exactly this shape: {"type":"flowchart"|"concept","direction":"TD"|"LR","nodes":[{"id":"user","label":"User"}],"edges":[{"from":"user","to":"application","label":"uses"}]}. Use 2-12 nodes and 1-20 edges. Node objects must contain only id and label; edge objects only from, to, and label. Labels must be concise, factual, and safe for Mermaid. Do not include sourceIndex or evidence fields. Do not output SVG, HTML, Mermaid syntax, or a separate diagram description. The only diagram representation must be the single diagram-json block. Do not omit the diagram block. Keep prose brief.`
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

    const previousMessages = Array.isArray(body.history)
      ? body.history.filter((item) =>
          item && typeof item === "object" &&
          ["student", "tutor", "hint"].includes(String((item as { role?: unknown }).role)) &&
          typeof (item as { text?: unknown }).text === "string"
        ).slice(-198)
      : [];
    const savedMessages = [
      ...previousMessages,
      { role: "student", text: currentMessage },
      {
        role: "tutor",
        text: tutorResponse.reply,
        ...(tutorResponse.diagram ? { diagram: tutorResponse.diagram } : {}),
        ...(tutorResponse.diagramData ? { diagramData: tutorResponse.diagramData } : {}),
        sources,
      },
    ];
    const firstStudentMessage = savedMessages.find((item) =>
      item && typeof item === "object" && (item as { role?: string }).role === "student"
    ) as { text?: string } | undefined;
    const title = firstStudentMessage?.text?.trim().slice(0, 80) || "New conversation";
    const requestedConversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;

    let conversationId = requestedConversationId;
    if (requestedConversationId) {
      const { data: savedConversation, error: saveError } = await supabase
        .from("conversations")
        .update({ messages: savedMessages, title, updated_at: new Date().toISOString() })
        .eq("id", requestedConversationId)
        .eq("user_id", user.id)
        .eq("document_id", document.id)
        .select("id")
        .maybeSingle();
      if (saveError || !savedConversation) {
        return NextResponse.json({ error: "Could not save this conversation" }, { status: 500 });
      }
    } else {
      const { data: createdConversation, error: createError } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          document_id: document.id,
          title,
          messages: savedMessages,
        })
        .select("id")
        .single();
      if (createError || !createdConversation) {
        console.error("[api/chat] conversation persistence failed", createError?.message);
        return NextResponse.json({ error: "Your answer was generated but the conversation could not be saved" }, { status: 500 });
      }
      conversationId = createdConversation.id;
    }

    return NextResponse.json({
      ...tutorResponse,
      diagramIsGeneral: Boolean(generalDiagramRequest && tutorResponse.diagramData),
      sources,
      retrievalMode,
      conversationId,
      ...(warning ? { warning } : {}),
    } satisfies ChatResponse);
  } catch (error) {
    if (error instanceof TutorProviderError) {
      return NextResponse.json(
        { error: error.message, code: "TUTOR_PROVIDER_ERROR" },
        { status: error.status },
      );
    }

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
  const requestBody = JSON.stringify({
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
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(
        `${GEMINI_GENERATE_API}/${GEMINI_CHAT_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
          signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      if (attempt === 2) {
        throw new TutorProviderError("The AI tutor could not be reached after 3 attempts. Please try again.", 503);
      }
    }

    if (response?.ok) break;

    const retryableStatus =
      response !== undefined &&
      [429, 500, 502, 503, 504].includes(response.status);
    if (attempt === 2 || (response && !retryableStatus)) {
      throw new TutorProviderError("The AI tutor could not process the request. Please try again.", response && response.status < 500 && response.status !== 429 ? 502 : 503);
    }

    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    response = undefined;
  }

  if (!response?.ok) {
    throw new TutorProviderError("The AI tutor could not process the request. Please try again.", 503);
  }

  let result: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  try {
    result = await response.json();
  } catch {
    throw new TutorProviderError("The AI tutor returned an invalid response. Please try again.", 502);
  }

  const reply = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!reply) {
    throw new TutorProviderError("The AI tutor returned an empty response. Please try again.", 502);
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