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

export async function GET() {
  const { data, error } = await supabase
    .from("prototypes")
    .select(
      "id, name, created_at, owner_id, users!prototypes_owner_id_fkey(email)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const prototypes = (data ?? []).map((row) => {
    const owner = row.users as { email?: string | null } | null;
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      owner_id: row.owner_id,
      owner_email: owner?.email ?? null,
    };
  });

  return NextResponse.json({ prototypes });
}
