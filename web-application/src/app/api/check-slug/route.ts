import { Database } from "@/lib/types/supabase";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidSlug, normalizeSlug, SLUG_RULES } from "@/lib/utils/slugUtils";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSlug = searchParams.get("slug") ?? "";
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    return NextResponse.json(
      { available: false, message: "Slug is required" },
      { status: 400 },
    );
  }

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      {
        available: false,
        message:
          `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("prototypes")
    .select("id")
    .eq("slug", slug)
    .limit(1);

  if (error) {
    return NextResponse.json(
      { available: false, message: "Unable to check slug availability" },
      { status: 500 },
    );
  }

  return NextResponse.json({ available: data.length === 0, slug });
}
