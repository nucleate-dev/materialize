import { SupabaseClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import crypto from 'crypto';

export async function takeScreenshotsOfKilledBuilds(
  killedPrototypeIds: string[],
  log2: SystemLogger,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  for (const prototypeId of killedPrototypeIds) {
    try {
      // Generate signed URL for the S3 object
      const signedUrl = getCloudfrontScreenshotUrl(prototypeId);

      // Take screenshot using Puppeteer
      const screenshot = await takeScreenshot(signedUrl, log2);
      if (!screenshot) {
        log2.warn('Failed to take screenshot for prototype', {
          prototypeId,
        });
        continue;
      }

      // Upload screenshot to Supabase Storage
      const uploadSuccess = await uploadScreenshotToSupabase(
        prototypeId,
        screenshot,
        supabase,
        log2,
      );
      if (uploadSuccess) {
        log2.info('Successfully took and uploaded screenshot', {
          prototypeId,
        });

        // Update the thumbnail_url in the prototypes table
        const updateSuccess = await updatePrototypeThumbnailUrl(
          prototypeId,
          supabase,
          log2,
        );
        if (!updateSuccess) {
          log2.warn('Failed to update prototype thumbnail_url', {
            prototypeId,
          });
        }
      } else {
        log2.warn('Failed to upload screenshot to Supabase', {
          prototypeId,
        });
      }
    } catch (error) {
      log2.error(error, 'Error processing screenshot for prototype', {
        prototypeId,
      });
    }
  }
}

async function takeScreenshot(
  url: string,
  log2: SystemLogger,
): Promise<Buffer | null> {
  let browser;
  try {
    // Try to launch with minimal Chrome dependencies
    browser = await puppeteer.launch({
      headless: true, // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--disable-extensions',
        '--disable-default-apps',
        '--no-default-browser-check',
        '--no-proxy-server',
        '--disable-sync',
        '--disable-plugins',
        '--disable-logging',
        '--disable-background-media-processing',
        '--mute-audio',
        '--disable-audio',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-background-networking',
      ],
      timeout: 30000,
      ignoreDefaultArgs: ['--disable-extensions'],
    });

    const page = await browser.newPage();

    // Set mobile phone viewport
    await page.setViewport({
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
    });

    // Set a reasonable timeout for page load
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    return screenshot as Buffer;
  } catch (error) {
    // Check if this is a Chrome dependency error
    if (error instanceof Error && error.message.includes('libnspr4.so')) {
      log2.error(
        error,
        'Chrome dependencies missing. Run install-chrome-dependencies.sh script to fix this issue.',
        { url, errorType: 'missing_chrome_dependencies' },
      );
    } else if (
      error instanceof Error &&
      error.message.includes('Failed to launch the browser process')
    ) {
      log2.error(
        error,
        'Browser launch failed. This may be due to missing system dependencies.',
        { url, errorType: 'browser_launch_failed' },
      );
    } else {
      log2.error(error, 'Failed to take screenshot', { url });
    }
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        log2.error(closeError, 'Failed to close browser');
      }
    }
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
    .from('prototype-thumbnails')
    .upload(fileName, screenshot, {
      contentType: 'image/png',
      upsert: true, // Overwrite if exists
      cacheControl: '600', // 10 min
    });
  if (error) {
    log2.error(error, 'Supabase storage upload failed', {
      prototypeId,
      fileName,
    });
    return false;
  }
  return true;
}

async function updatePrototypeThumbnailUrl(
  prototypeId: string,
  supabase: SupabaseClient<Database>,
  log2: SystemLogger,
): Promise<boolean> {
  // Generate the public URL for the uploaded screenshot
  const { data } = supabase.storage
    .from('prototype-thumbnails')
    .getPublicUrl(`${prototypeId}.png`);

  const thumbnailUrl = data.publicUrl;

  // Update the prototypes table with the thumbnail URL
  const { error } = await supabase
    .from('prototypes')
    .update({
      thumbnail_url: thumbnailUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prototypeId);

  if (error) {
    log2.error(error, 'Failed to update prototype thumbnail_url in database', {
      prototypeId,
      thumbnailUrl,
    });
    return false;
  }
  return true;
}

export function getCloudfrontScreenshotUrl(prototypeId: string): string {
  const host = `${prototypeId}.render.materializeui.com`;
  const token = generateServiceTokenForScreenshotAccess(host, '/', 30);
  return `https://${host}/?token=${token}`;
}

function generateServiceTokenForScreenshotAccess(
  host: string,
  path: string,
  ttlSeconds = 30,
): string {
  const ts = Math.floor(Date.now() / 1000);
  const exp = ts + ttlSeconds;
  const nonce = base64url(crypto.randomBytes(8)); // 64 bits random

  // Bind to host + path so it can’t be replayed on another subdomain or route
  const payload = `${host}|${path}|${exp}|${nonce}`;
  const secret = process.env.MATERIALIZE_SCREENSHOT_SECRET!;

  const hmac = crypto.createHmac('sha256', secret).update(payload).digest();
  const token = `${exp}:${nonce}:${base64url(hmac)}`;
  return base64url(Buffer.from(token));
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
