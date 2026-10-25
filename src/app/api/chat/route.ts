import { NextResponse } from "next/server";
import { chunkText } from "@/lib/documents/chunker";
import { retrieveRelevantChunks } from "@/lib/documents/retrieval";
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_RETRIEVED_CHUNKS = 3;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, documentText, history = [] } = body;

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
    const contextText = relevantChunks.length > 0 
      ? relevantChunks.map((result, i) => `Passage ${i + 1}:\n${result.chunk}`).join("\n\n")
      : "No direct relevant passages found in the document.";

    // Updated Socratic prompt with an exit condition for correct answers
    const prompt = `You are a Socratic academic tutor. Your goal is to guide the student to the correct answer rather than giving it to them directly. 

If the student has fully and correctly answered the concept, validate their answer, praise their understanding, and ask if they have any new questions. DO NOT ask another leading question about the current topic if they already understand it.

If they are still learning or struggling, use ONLY the provided context passages to provide a thoughtful hint or ask a leading question that helps them discover the answer. Do not give the direct answer away. If the information is not in the passages, state clearly that you cannot find it.

Context Passages:
${contextText}

User Question: ${message}`;

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

    // Map frontend "student" to "user" and everything else ("tutor", "hint") to "model"
    let formattedHistory = history.map((msg: any) => ({
      role: msg.role === "student" ? "user" : "model",
      parts: [{ text: msg.text || msg.content || "" }],
    }));

    // Gemini strictly requires the history to start with a 'user' message.
    // This removes the initial "Hello! I am your Socratic Tutor." greeting.
    while (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
      formattedHistory.shift();
    }

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessage(prompt);
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