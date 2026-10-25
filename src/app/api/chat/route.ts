import { NextResponse } from "next/server";
import { chunkText } from "@/lib/documents/chunker";
import { retrieveRelevantChunks } from "@/lib/documents/retrieval";

const MAX_RETRIEVED_CHUNKS = 3;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, documentText } = body;

    if (!message || !documentText) {
      return NextResponse.json(
        { error: "Message and document text are required" },
        { status: 400 }
      );
    }

    const chunks = chunkText(documentText, {
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    if (!chunks || chunks.length === 0) {
      return NextResponse.json(
        { reply: "No document content available to search." },
        { status: 200 }
      );
    }

    const relevant = retrieveRelevantChunks(chunks, message, MAX_RETRIEVED_CHUNKS);

    let replyMessage = `Question: "${message}"\n\n`;

    if (relevant.length === 0) {
      replyMessage +=
        "Could not find any relevant passages in the document for your question. Try rephrasing or asking about a different topic.";
    } else {
      replyMessage += relevant
        .map((result, i) => `Passage ${i + 1}: "${result.chunk}"`)
        .join("\n\n");
    }

    return NextResponse.json({ reply: replyMessage });

  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}