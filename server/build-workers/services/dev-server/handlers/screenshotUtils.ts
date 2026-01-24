import { SupabaseClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { Database } from "../../../types/supabase.js";
import { DEV_SERVER_PORT } from "../NucleateDevelopmentServerService.js";

type ScreenshotAspect = "mobile" | "web";

interface ScreenshotOptions {
  aspect?: ScreenshotAspect;
}

/**
 * Takes a screenshot of the local dev server and uploads it to Supabase
 * @param prototypeId - The ID of the prototype
 * @param log2 - System logger instance
 * @param supabase - Supabase client instance
 * @returns Promise<boolean> - True if screenshot was successfully taken and uploaded
 */
export async function takeScreenshotAndUpload(
  prototypeId: string,
  log2: SystemLogger,
  supabase: SupabaseClient<Database>,
  options: ScreenshotOptions = {},
): Promise<boolean> {
  let browser: puppeteer.Browser | undefined;
  let page: puppeteer.Page | undefined;
  const aspect = options.aspect ?? "mobile";

  try {
    // Launch browser
    const browserResult = await launchBrowser(log2, aspect);
    browser = browserResult?.browser;
    page = browserResult?.page;

    if (!browser || !page) {
      log2.error(
        new Error("Failed to launch browser or page"),
        "Cannot take screenshot without browser or page",
      );
      return false;
    }

    // Take screenshot of local dev server
    const screenshot = await takeScreenshotWithPage(
      page,
      `http://localhost:${DEV_SERVER_PORT}`,
      log2,
    );

    if (!screenshot) {
      log2.warn("Failed to take screenshot for prototype", {
        prototypeId,
      });
      return false;
    }

    // Upload screenshot to Supabase Storage
    const uploadSuccess = await uploadScreenshotToSupabase(
      prototypeId,
      screenshot,
      supabase,
      log2,
    );

    if (uploadSuccess) {
      log2.consoleLogDevOnly("info", "Successfully took and uploaded screenshot", {
        prototypeId,
      });
      return true;
    } else {
      log2.warn("Failed to upload screenshot to Supabase", {
        prototypeId,
      });
      return false;
    }
  } catch (error) {
    log2.error(error, "Error taking and uploading screenshot", {
      prototypeId,
    });
    return false;
  } finally {
    // Close browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        log2.error(closeError, "Failed to close browser");
      }
    }
  }
}

async function launchBrowser(
  log2: SystemLogger,
  aspect: ScreenshotAspect,
): Promise<{ browser: puppeteer.Browser; page: puppeteer.Page } | null> {
  try {
    // Launch with minimal Chrome dependencies
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--disable-software-rasterizer",
        "--disable-web-security",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI,VizDisplayCompositor",
        "--disable-extensions",
        "--disable-default-apps",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--disable-sync",
        "--disable-plugins",
        "--disable-logging",
        "--disable-background-media-processing",
        "--mute-audio",
        "--disable-audio",
        "--disable-ipc-flooding-protection",
        "--disable-hang-monitor",
        "--disable-prompt-on-repost",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--disable-background-networking",
      ],
      timeout: 30000,
      ignoreDefaultArgs: ["--disable-extensions"],
    });

    const page = await browser.newPage();

    // Choose viewport based on desired aspect ratio
    if (aspect === "web") {
      // Web prototypes prefer a desktop-sized viewport
      await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      });
    } else {
      // Default to a mobile-sized viewport (iPhone 8-ish)
      await page.setViewport({
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
      });
    }
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "light" },
    ]);

    return { browser, page };
  } catch (error) {
    // Check if this is a Chrome dependency error
    if (error instanceof Error && error.message.includes("libnspr4.so")) {
      log2.error(
        error,
        "Chrome dependencies missing. Install Chrome dependencies to fix this issue.",
        { errorType: "missing_chrome_dependencies" },
      );
    } else if (
      error instanceof Error &&
      error.message.includes("Failed to launch the browser process")
    ) {
      log2.error(
        error,
        "Browser launch failed. This may be due to missing system dependencies.",
        { errorType: "browser_launch_failed" },
      );
    } else {
      log2.error(error, "Failed to launch browser");
    }
    return null;
  }
}

async function takeScreenshotWithPage(
  page: puppeteer.Page,
  url: string,
  log2: SystemLogger,
): Promise<Buffer | null> {
  try {
    // Set a reasonable timeout for page load
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    return screenshot as Buffer;
  } catch (error) {
    log2.error(error, "Failed to take screenshot", { url });
    return null;
  }
}

async function uploadScreenshotToSupabase(
  prototypeId: string,
  screenshot: Buffer,
  supabase: SupabaseClient<Database>,
  log2: SystemLogger,
): Promise<boolean> {
  const fileName = `${prototypeId}.png`;
  const { error } = await supabase.storage
    .from("prototype-thumbnails")
    .upload(fileName, screenshot, {
      contentType: "image/png",
      upsert: true, // Overwrite if exists
      cacheControl: "600", // 10 min
    });

  if (error) {
    log2.error(error, "Supabase storage upload failed", {
      prototypeId,
      fileName,
    });
    return false;
  }
  return true;
}
