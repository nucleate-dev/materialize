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

type ImageMetadata = {
  storage_path?: string;
};

type RawChatMessage = {
  id: string;
  chat_session_id: string | null;
  content: string;
  created_at: string;
  message_type: string;
  event_type: string | null;
  event_data: unknown;
  role: string;
  credits_used: number | null;
  image_url: string | null;
};

function parseEventData(eventData: unknown) {
  if (typeof eventData === "string") {
    try {
      return { parsed: JSON.parse(eventData), raw: eventData };
    } catch {
      return { parsed: null, raw: eventData };
    }
  }

  return { parsed: eventData, raw: null };
}

async function resolveImageUrls(images: ImageMetadata[]) {
  const urls: string[] = [];

  for (const image of images) {
    if (!image.storage_path) {
      continue;
    }

    const { data, error } = await supabase.storage
      .from("prototype-assets")
      .createSignedUrl(image.storage_path, 3600);

    if (error) {
      continue;
    }

    if (data?.signedUrl) {
      urls.push(data.signedUrl);
    }
  }

  return urls;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatSessionId = searchParams.get("session_id");

  if (!chatSessionId) {
    return NextResponse.json(
      { error: "session_id query param is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("prototype_chat_messages")
    .select("*")
    .eq("chat_session_id", chatSessionId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = (data ?? []) as RawChatMessage[];

  const enriched = await Promise.all(
    messages.map(async (message) => {
      const { parsed, raw } = parseEventData(message.event_data);
      let imageUrls: string[] = [];

      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { images?: ImageMetadata[] }).images)
      ) {
        imageUrls = await resolveImageUrls(
          (parsed as { images: ImageMetadata[] }).images,
        );
      }

      return {
        ...message,
        event_data: parsed ?? message.event_data,
        event_data_raw: raw,
        resolved_image_urls: imageUrls,
      };
    }),
  );

  return NextResponse.json({ messages: enriched });
}
