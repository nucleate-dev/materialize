import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
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

    const filePath = `${prototypeId}/${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("prototype-snapshots")
      .upload(filePath, screenshot, {
        upsert: true,
        contentType: "image/png",
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
