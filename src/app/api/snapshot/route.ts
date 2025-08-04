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

    // Determine if we're in a serverless environment
    const isServerless =
      process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

    console.log("Environment check:", {
      isServerless,
      NODE_ENV: process.env.NODE_ENV,
    });

    let executablePath;
    let args;

    if (isServerless) {
      // Use @sparticuz/chromium for serverless environments
      console.log("Using serverless chromium");
      executablePath = await chromium.executablePath();
      args = chromium.args;
    } else {
      // For local development, first try puppeteer's bundled chromium
      console.log("Local development mode");
      try {
        // Try to use puppeteer's bundled chromium (if regular puppeteer is installed)
        let puppeteerRegular;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          puppeteerRegular = require("puppeteer");
        } catch {
          puppeteerRegular = null;
        }

        if (puppeteerRegular && puppeteerRegular.executablePath) {
          console.log("Using puppeteer bundled chromium");
          executablePath = puppeteerRegular.executablePath();
          args = ["--no-sandbox", "--disable-setuid-sandbox"];
        } else {
          throw new Error("Puppeteer not available");
        }
      } catch {
        // Fallback to local Chrome installation
        console.log(
          "Puppeteer bundled chromium not available, trying local Chrome",
        );
        const localChromePaths = [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
          "/usr/bin/google-chrome-stable", // Linux
          "/usr/bin/google-chrome", // Linux alternative
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Windows
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", // Windows 32-bit
        ];

        executablePath = localChromePaths.find((path) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const fs = require("fs");
            return fs.existsSync(path);
          } catch {
            return false;
          }
        });

        if (!executablePath) {
          // Final fallback to @sparticuz/chromium
          console.log(
            "No local Chrome found, falling back to @sparticuz/chromium",
          );
          try {
            executablePath = await chromium.executablePath();
            args = chromium.args;
          } catch (err) {
            console.error("All fallbacks failed:", err);
            throw new Error(
              `No Chrome executable found. Error: ${err instanceof Error ? err.message : "Unknown error"}. Please install Chrome or run "npm install puppeteer" for local development.`,
            );
          }
        } else {
          console.log("Using local Chrome at:", executablePath);
          args = ["--no-sandbox", "--disable-setuid-sandbox"];
        }
      }
    }

    console.log("Launching browser with:", {
      executablePath,
      args: args.slice(0, 5),
    });

    const browser = await puppeteer.launch({
      args,
      defaultViewport: { width: 400, height: 800 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto(snackUrl, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const screenshot = await page.screenshot({ type: "png" });
    await browser.close();

    const filePath = `${prototypeId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("prototype-thumbnails")
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
    } = supabase.storage.from("prototype-thumbnails").getPublicUrl(filePath);

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
