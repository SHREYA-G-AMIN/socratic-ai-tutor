import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,document_id,messages,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not load this conversation" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ conversation: data });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) {
    return NextResponse.json({ error: "A valid messages array is required" }, { status: 400 });
  }

  const messages = (body as { messages: unknown[] }).messages.slice(-200);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const firstStudentMessage = messages.find((item) =>
    item && typeof item === "object" && (item as { role?: string }).role === "student"
  ) as { text?: string } | undefined;
  const title = typeof firstStudentMessage?.text === "string"
    ? firstStudentMessage.text.trim().slice(0, 80) || "New conversation"
    : "New conversation";

  const { data, error } = await supabase
    .from("conversations")
    .update({ messages, title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not save this conversation" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { error } = await supabase.from("conversations").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete this conversation" }, { status: 500 });
  return NextResponse.json({ success: true });
}
