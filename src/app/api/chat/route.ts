import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, documentText } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const placeholderReply = `Backend received your question: "${message}". Provided document has ${documentText?.length || 0} characters.`;

    return NextResponse.json({ reply: placeholderReply });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}