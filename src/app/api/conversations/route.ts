import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,document_id,created_at,updated_at,messages")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/conversations] list failed", error.message);
    return NextResponse.json({ error: "Could not load chat history" }, { status: 500 });
  }
  return NextResponse.json({
    conversations: (data ?? []).map(({ messages, ...conversation }) => ({
      ...conversation,
      message_count: Array.isArray(messages) ? messages.length : 0,
    })),
  });
}
