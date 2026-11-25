import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data, error } = await supabase
    .from("documents")
    .select("id,file_name,file_size_bytes,page_count,character_count,ocr_used,ocr_provider,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/documents] list failed", error.message);
    return NextResponse.json({ error: "Could not load your documents" }, { status: 500 });
  }
  return NextResponse.json({ documents: data ?? [] });
}
