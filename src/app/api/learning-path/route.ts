import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at,messages")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/learning-path] progress query failed", error.message);
    return NextResponse.json({ error: "Could not load learning progress" }, { status: 500 });
  }

  const conversations = (data ?? []).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updated_at: conversation.updated_at,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  }));

  return NextResponse.json({ conversations });
}
