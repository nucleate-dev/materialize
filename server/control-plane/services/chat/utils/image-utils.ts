/**
 * Utility functions for handling images in chat
 * Specifically for converting Supabase Storage URLs to base64 for LLM consumption
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';

const BUCKET_NAME = 'chat-images';

/**
 * Extract the storage path from a signed or public Supabase URL
 */
function extractStoragePath(imageUrlOrPath: string): string | null {
  // If it already looks like a path (no https://), return as is
  if (
    !imageUrlOrPath.startsWith('http://') &&
    !imageUrlOrPath.startsWith('https://')
  ) {
    return imageUrlOrPath;
  }

  // Try to extract from signed URL: /object/sign/{bucket}/{path}?token=...
  const signedMatch = imageUrlOrPath.match(
    /\/object\/sign\/[^/]+\/(.+?)(?:\?|$)/,
  );
  if (signedMatch && signedMatch[1]) {
    return decodeURIComponent(signedMatch[1]);
  }

  // Try to extract from public URL: /object/public/{bucket}/{path}
  const publicMatch = imageUrlOrPath.match(
    /\/object\/public\/[^/]+\/(.+?)(?:\?|$)/,
  );
  if (publicMatch && publicMatch[1]) {
    return decodeURIComponent(publicMatch[1]);
  }

  return null;
}

/**
 * Fetch an image from Supabase Storage and convert it to base64 data URI
 * @param imageUrlOrPath Either a full URL or storage path
 * @param supabase Supabase client with appropriate permissions
 * @param log2 Logger instance
 * @returns Base64 data URI string or null if error
 */
export async function fetchImageAsBase64(
  imageUrlOrPath: string,
  supabase: SupabaseClient,
  log2: SystemLogger,
): Promise<string | null> {
  try {
    // Extract the storage path
    const storagePath = extractStoragePath(imageUrlOrPath);
    if (!storagePath) {
      log2.warn('[image-utils] Could not extract storage path from URL', {
        imageUrlOrPath,
      });
      return null;
    }

    log2.consoleLogDevOnly(
      'info',
      '[image-utils] Fetching image from storage',
      {
        storagePath,
      },
    );

    // Download the file from Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error || !data) {
      log2.warn('[image-utils] Failed to download image from storage', {
        storagePath,
        error: error?.message,
      });
      return null;
    }

    // Convert blob to base64
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // Determine MIME type from blob or default to common image types
    let mimeType = data.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
      // Try to infer from file extension
      const extension = storagePath.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      mimeType = mimeMap[extension || ''] || 'image/png';
    }

    // Create data URI
    const dataUri = `data:${mimeType};base64,${base64}`;

    log2.consoleLogDevOnly(
      'info',
      '[image-utils] Successfully converted image to base64',
      {
        storagePath,
        mimeType,
        base64Length: base64.length,
      },
    );

    return dataUri;
  } catch (error) {
    log2.error(
      error,
      '[image-utils] Unexpected error fetching image as base64',
      {
        imageUrlOrPath,
      },
    );
    return null;
  }
}
