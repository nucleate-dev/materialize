import { Database } from "@/lib/types/supabase";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidSlug, normalizeSlug, SLUG_RULES } from "@/lib/utils/slugUtils";
import {
  normalizePrototypeVisibility,
  type PrototypeVisibility,
} from "@/lib/types/prototypes";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const APPS_BASE_URL =
  (process.env.NEXT_PUBLIC_APPS_BASE_URL ??
    process.env.NEXT_PUBLIC_APPS_HOST ??
    "https://apps.nucleate.dev").replace(/\/$/, "");

interface DeployRequestBody {
  prototype_id?: string;
  slug?: string;
  visibility?: string;
}

const isValidVisibility = (visibility?: string): visibility is PrototypeVisibility =>
  visibility === "PUBLIC" ||
  visibility === "SELF" ||
  visibility === "TEAM_SUBSET" ||
  visibility === "TEAM";

const extractToken = (req: NextRequest) => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [, token] = authHeader.split(" ");
  return token ?? null;
};

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json({ message: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json()) as DeployRequestBody;
  const normalizedSlug = normalizeSlug(body.slug ?? "");

  if (!body.prototype_id) {
    return NextResponse.json(
      { message: "prototype_id is required" },
      { status: 400 },
    );
  }

  if (!normalizedSlug) {
    return NextResponse.json(
      { message: "Slug is required" },
      { status: 400 },
    );
  }

  if (!isValidSlug(normalizedSlug)) {
    return NextResponse.json(
      {
        message:
          `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
      },
      { status: 400 },
    );
  }

  const requestedVisibility = body.visibility
    ? normalizePrototypeVisibility(body.visibility)
    : ("PUBLIC" as PrototypeVisibility);
  const visibility = isValidVisibility(requestedVisibility)
    ? requestedVisibility
    : ("PUBLIC" as PrototypeVisibility);

  const { data: prototype, error: prototypeError } = await supabase
    .from("prototypes")
    .select("id, owner_id, slug")
    .eq("id", body.prototype_id)
    .single();

  if (prototypeError || !prototype) {
    return NextResponse.json({ message: "Prototype not found" }, { status: 404 });
  }

  if (prototype.owner_id && prototype.owner_id !== authData.user.id) {
    return NextResponse.json(
      { message: "You do not have permission to deploy this prototype" },
      { status: 403 },
    );
  }

  const { data: slugMatches, error: slugCheckError } = await supabase
    .from("prototypes")
    .select("id")
    .eq("slug", normalizedSlug)
    .neq("id", prototype.id)
    .limit(1);

  if (slugCheckError) {
    return NextResponse.json(
      { message: "Unable to validate slug uniqueness" },
      { status: 500 },
    );
  }

  if ((slugMatches?.length ?? 0) > 0) {
    return NextResponse.json(
      { message: "Slug already in use" },
      { status: 409 },
    );
  }

  const { data: updatedPrototype, error: updateError } = await supabase
    .from("prototypes")
    .update({
      slug: normalizedSlug,
      visibility,
      is_deployed: true,
    })
    .eq("id", prototype.id)
    .select("id, slug, visibility")
    .single();

  if (updateError || !updatedPrototype) {
    return NextResponse.json(
      { message: "Unable to deploy prototype" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    prototype_id: updatedPrototype.id,
    slug: updatedPrototype.slug,
    visibility: updatedPrototype.visibility,
    url: `${APPS_BASE_URL}/${updatedPrototype.slug}`,
  });
}
