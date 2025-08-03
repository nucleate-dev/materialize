import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { prototypeId: string } },
) {
  const { url } = await request.json();
  const { prototypeId } = params;

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    // @ts-expect-error: runtime import without types
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const screenshot = await page.screenshot({ type: "png" });
    await browser.close();

    const filePath = `${prototypeId}/latest.png`;
    const { error: uploadError } = await supabase.storage
      .from("prototype-thumbnails")
      .upload(filePath, screenshot, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("prototype-thumbnails")
      .getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("prototypes")
      .update({ thumbnail_url: publicUrl })
      .eq("id", prototypeId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, thumbnailUrl: publicUrl });
  } catch (err) {
    console.error("Failed to capture snapshot:", err);
    return NextResponse.json(
      { error: "Failed to capture snapshot" },
      { status: 500 },
    );
  }
}
