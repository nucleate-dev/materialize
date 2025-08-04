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

    // Enhanced browser args to bypass CORS and other restrictions
    const enhancedArgs = [
      ...args,
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-field-trial-config',
      '--disable-back-forward-cache',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--ignore-certificate-errors-spki-list',
      '--ignore-ssl-errors-spki-list',
      '--allow-running-insecure-content'
    ];

    const browser = await puppeteer.launch({
      args: enhancedArgs,
      defaultViewport: { width: 400, height: 800 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    
    console.log('Attempting to navigate to:', snackUrl);
    
    // Set up better error handling and longer timeout
    try {
      // Set a custom user agent to avoid bot detection
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      
      // Disable JavaScript temporarily to see if that helps with CORS
      // await page.setJavaScriptEnabled(false);
      
      // Try to navigate with extended timeout and different wait conditions
      const response = await page.goto(snackUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      console.log('Navigation response status:', response?.status());
      
      if (!response || response.status() >= 400) {
        throw new Error(`Failed to load page. Status: ${response?.status()}`);
      }
      
      // Wait for potential content to load, but don't wait for network idle
      // since Expo Snack might have continuous network activity
      await new Promise((resolve) => setTimeout(resolve, 8000));
      
      // Check if we have any meaningful content
      const content = await page.content();
      console.log('Page content length:', content.length);
      console.log('Page title:', await page.title());
      
      // Look for specific indicators that the page loaded properly
      const hasExpoContent = content.includes('expo') || content.includes('snack') || content.includes('React Native');
      console.log('Has Expo content:', hasExpoContent);
      
      if (!hasExpoContent && content.length < 1000) {
        console.warn('Page appears to have minimal content, might be blocked');
      }
      
    } catch (navigationError) {
      console.error('Navigation failed:', navigationError);
      
      // Try alternative approaches
      const alternatives = [
        snackUrl.replace('snack.expo.dev', 'snack.expo.io'),
        snackUrl.replace(/\/embedded/, ''), // Remove embedded flag
        snackUrl + '?embed=true', // Add embed parameter
        snackUrl + '?platform=web', // Force web platform
      ].filter(url => url !== snackUrl);
      
      for (const altUrl of alternatives) {
        console.log('Trying alternative URL:', altUrl);
        try {
          await page.goto(altUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
          });
          await new Promise((resolve) => setTimeout(resolve, 3000));
          
          // Check if this version worked better
          const altContent = await page.content();
          if (altContent.length > 1000) {
            console.log('Alternative URL worked better');
            break;
          }
        } catch (altError) {
          console.error(`Alternative URL ${altUrl} failed:`, altError instanceof Error ? altError.message : altError);
          continue;
        }
      }
    }
    
    console.log('Taking screenshot...');
    
    // Take screenshot with error handling
    let screenshot: Buffer;
    try {
      screenshot = await page.screenshot({ 
        type: "png",
        fullPage: false,
        clip: { x: 0, y: 0, width: 400, height: 800 }
      });
    } catch (screenshotError) {
      console.error('Screenshot failed, trying full page:', screenshotError);
      // Fallback to full page screenshot
      screenshot = await page.screenshot({ 
        type: "png",
        fullPage: false
      });
    }
    
    await browser.close();
    
    console.log('Screenshot captured, size:', screenshot.length, 'bytes');
    
    // Validate screenshot isn't empty or too small (indicating failure)
    if (screenshot.length < 1000) {
      console.warn('Screenshot appears to be very small, might indicate capture failure');
      
      // Create a fallback placeholder screenshot
      console.log('Creating fallback placeholder screenshot...');
      const placeholderPage = await (await puppeteer.launch({
        args: enhancedArgs,
        defaultViewport: { width: 400, height: 800 },
        executablePath,
        headless: true,
      })).newPage();
      
      // Create a simple HTML placeholder
      await placeholderPage.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
            }
            .logo {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              font-weight: 600;
              margin-bottom: 10px;
            }
            .subtitle {
              font-size: 16px;
              opacity: 0.8;
              margin-bottom: 30px;
            }
            .status {
              font-size: 14px;
              background: rgba(255,255,255,0.2);
              padding: 10px 20px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="logo">📱</div>
          <div class="title">React Native Preview</div>
          <div class="subtitle">Prototype ${prototypeId.substring(0, 8)}...</div>
          <div class="status">Preview generating...</div>
        </body>
        </html>
      `);
      
      screenshot = await placeholderPage.screenshot({ 
        type: "png",
        fullPage: false,
        clip: { x: 0, y: 0, width: 400, height: 800 }
      });
      
      await (await placeholderPage.browser()).close();
      console.log('Fallback screenshot created, size:', screenshot.length, 'bytes');
    }

    const filePath = `${prototypeId}.png`;
    
    console.log('Uploading screenshot to Supabase storage...');
    console.log('File path:', filePath);
    console.log('Screenshot size:', screenshot.length, 'bytes');
    
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

    console.log('Screenshot uploaded successfully');
    
    const {
      data: { publicUrl },
    } = supabase.storage.from("prototype-thumbnails").getPublicUrl(filePath);
    
    console.log('Generated public URL:', publicUrl);

    const { error: updateError } = await supabase
      .from("prototypes")
      .update({ thumbnail_url: publicUrl })
      .eq("id", prototypeId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log('Database updated successfully with thumbnail URL');
    
    return NextResponse.json({ 
      success: true, 
      filePath,
      publicUrl,
      screenshotSize: screenshot.length 
    });
  } catch (err: unknown) {
    console.error("Snapshot error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
