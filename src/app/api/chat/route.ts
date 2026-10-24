import { NextResponse } from "next/server";
import { chunkText } from "@/lib/documents/chunker"; 

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

    // Bypass strict type checking for the options object
    const chunks = chunkText(documentText, { maxLength: 500 } as any); 

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ reply: "No document content available to search." });
    }

    const keywords = message.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    
    const scoredChunks = chunks.map((item: any) => {
      const chunkString = item.text || item; 
      const lowerChunk = chunkString.toLowerCase();
      
      const score = keywords.reduce((acc: number, word: string) => 
        lowerChunk.includes(word) ? acc + 1 : acc, 0
      );
      
      return { chunk: chunkString, score };
    });

    scoredChunks.sort((a: any, b: any) => b.score - a.score);
    const bestChunk = scoredChunks[0];

    let replyMessage = `Question: "${message}"\n\n`;
    if (bestChunk && bestChunk.score > 0) {
      replyMessage += `Most relevant text found: "${bestChunk.chunk}"`;
    } else {
      replyMessage += `Could not find any exact keyword matches in the document.`;
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