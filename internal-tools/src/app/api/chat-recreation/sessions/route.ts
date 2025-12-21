import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prototypeId = searchParams.get("prototype_id");

  if (!prototypeId) {
    return NextResponse.json(
      { error: "prototype_id query param is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("prototype_chat_sessions")
    .select(
      "id, prototype_id, session_id, session_type, created_at, chat_context, user_id",
    )
    .eq("prototype_id", prototypeId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}
