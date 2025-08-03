import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { prototypeId: string } },
) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.split(" ")[1];
  if (!token || !authHeader?.startsWith("Bearer")) {
    return NextResponse.json(
      { error: "Unauthorized: No token provided" },
      { status: 401 },
    );
  }

  let userID: string;
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as jwt.JwtPayload;
    userID = decoded.sub as string;
  } catch (error) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  );

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
      .eq("id", prototypeId)
      .eq("user_id", userID);

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
