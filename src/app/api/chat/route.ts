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
  retrieveRelevantChunks,
  retrieveSemanticallyRelevantChunks,
  type RetrievalResult,
} from "@/lib/documents/retrieval";
import type { DocumentPageRange } from "@/types/document";
import type { ChatResponse, ChatSourceReference } from "@/types/chat";

const MAX_RETRIEVED_CHUNKS = 3;
const MAX_MESSAGE_LENGTH = 2_000;
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
        message.trim(),
        {
          maxResults: MAX_RETRIEVED_CHUNKS,
          pageRanges,
        },
      );
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
        message.trim(),
        MAX_RETRIEVED_CHUNKS,
        pageRanges,
      );
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

    if (sources.length === 0) {
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
        : "No direct relevant passages found in the document.";
    const prompt = `Context Passages:\n${contextText}\n\nUser Question: ${message.trim()}`;

    const history = parseChatHistory(body.history);
    const contents = [...history, { role: "user" as const, parts: [{ text: prompt }] }];
    while (contents.length > 1 && contents[0].role === "model") {
      contents.shift();
    }

    const intent = detectTutoringIntent(message.trim());
    const confusion = detectConfusion(
      message.trim(),
      history.map((turn) => ({
        role: turn.role === "user" ? "student" : "tutor",
        text: turn.parts.map((part) => part.text).join(""),
      })),
    );
    const diagramRequest = getDiagramRequest(message.trim());
    const generatedResponse = await generateTutorReply(
      apiKey,
      contents,
      getTutorInstructions(intent, confusion.severity, diagramRequest, sources.length > 0),
    );
    const tutorResponse = parseTutorResponse(generatedResponse, {
      allowDiagram: diagramRequest !== "none" && sources.length > 0,
    });

    return NextResponse.json({
      ...tutorResponse,
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