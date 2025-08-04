import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { Database } from "@/lib/types/database.types";
import jwt from "jsonwebtoken";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token || !request.headers.get("authorization")?.startsWith("Bearer")) {
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;
      if (!decoded.sub) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid user ID" },
          { status: 401 },
        );
      }
    } catch (error) {
      console.error("Invalid JWT token: ", error);
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    const { snackUrl, prototypeId } = await request.json();

    if (!snackUrl || !prototypeId) {
      return NextResponse.json(
        { error: "snackUrl and prototypeId are required" },
        { status: 400 },
      );
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 400, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(snackUrl, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const screenshot = await page.screenshot({ type: "png" });
    await browser.close();

    const filePath = `${prototypeId}/${prototypeId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("prototype-snapshots")
      .upload(filePath, screenshot, {
        upsert: true,
        contentType: "image/png",
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("prototype-snapshots").getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from("prototypes")
      .update({ thumbnail_url: publicUrl })
      .eq("id", prototypeId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, filePath });
  } catch (err: unknown) {
    console.error("Snapshot error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
