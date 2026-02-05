import puppeteer from "puppeteer";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { DEV_SERVER_PORT } from "../NucleateDevelopmentServerService.js";

type ScreenshotAspect = "mobile" | "web";

export interface ScreenshotResult {
  buffer: Buffer;
  width: number;
  height: number;
}

const BROWSER_LAUNCH_ARGS = [
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
];

const VIEWPORTS: Record<
  ScreenshotAspect,
  { width: number; height: number; deviceScaleFactor: number }
> = {
  mobile: { width: 375, height: 667, deviceScaleFactor: 2 },
  web: { width: 1280, height: 720, deviceScaleFactor: 1 },
};

export class ScreenshotService {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private currentAspect: ScreenshotAspect | null = null;
  private log: SystemLogger;

  constructor(logger: SystemLogger) {
    this.log = logger;
  }

  async takeScreenshot(
    path: string,
    aspect: ScreenshotAspect = "mobile",
  ): Promise<ScreenshotResult> {
    await this.ensureBrowser(aspect);

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `http://localhost:${DEV_SERVER_PORT}${normalizedPath}`;

    await this.page!.goto(url, {
      waitUntil: "networkidle0",
      timeout: 15000,
    });

    const screenshot = await this.page!.screenshot({
      type: "png",
      fullPage: false,
    });

    const viewport = VIEWPORTS[aspect];
    return {
      buffer: screenshot as Buffer,
      width: viewport.width,
      height: viewport.height,
    };
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        this.log.error(error, "Failed to close screenshot browser");
      }
      this.browser = null;
      this.page = null;
      this.currentAspect = null;
    }
  }

  private async ensureBrowser(aspect: ScreenshotAspect): Promise<void> {
    if (this.browser && !this.browser.connected) {
      this.log.warn("Screenshot browser disconnected, will re-launch");
      this.browser = null;
      this.page = null;
      this.currentAspect = null;
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: BROWSER_LAUNCH_ARGS,
        timeout: 30000,
        ignoreDefaultArgs: ["--disable-extensions"],
      });

      this.page = await this.browser.newPage();
      await this.page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: "light" },
      ]);
      this.currentAspect = null;
    }

    if (this.currentAspect !== aspect) {
      await this.page!.setViewport(VIEWPORTS[aspect]);
      this.currentAspect = aspect;
    }
  }
}
