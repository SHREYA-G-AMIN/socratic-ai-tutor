import { NextResponse } from "next/server";
import { chunkText } from "@/lib/documents/chunker";
import { retrieveRelevantChunks } from "@/lib/documents/retrieval";
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_RETRIEVED_CHUNKS = 3;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

// Initialize the Gemini client using the key from .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    const relevantChunks = retrieveRelevantChunks(chunks, message, MAX_RETRIEVED_CHUNKS);
    
    // Construct the context blocks from the retrieved chunks
    const contextText = relevantChunks.length > 0 
      ? relevantChunks.map((result, i) => `Passage ${i + 1}:\n${result.chunk}`).join("\n\n")
      : "No direct relevant passages found in the document.";

    // Build the instruction prompt for Gemini
    const prompt = `You are a helpful academic tutor. Answer the user's question using ONLY the provided context passages from their document. If the answer is not contained within the passages, state clearly that you cannot find the information in the provided document.\n\nContext Passages:\n${contextText}\n\nUser Question: ${message}`;

    // Select the model and generate the response
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const replyMessage = result.response.text();

    return NextResponse.json({ reply: replyMessage });

  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}