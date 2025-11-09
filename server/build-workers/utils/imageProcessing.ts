import sharp from "sharp";

export interface ProcessedImage {
  buffer: Buffer;
  mediaType: string;
  extension: string;
}

/**
 * Resize and optimize an image for storage
 * - Resizes to max 1920px width while maintaining aspect ratio
 * - Compresses to reasonable quality (80 for JPEG, 80 for PNG)
 * - Converts to appropriate format
 */
export async function processImage(
  base64Data: string,
  originalMediaType: string,
): Promise<ProcessedImage> {
  // Convert base64 to buffer
  const imageBuffer = Buffer.from(base64Data, "base64");

  // Determine output format based on input type
  const isTransparent = originalMediaType === "image/png" || originalMediaType === "image/webp";
  const outputFormat = isTransparent ? "png" : "jpeg";
  const mediaType = isTransparent ? "image/png" : "image/jpeg";

  // Process image with sharp
  let sharpInstance = sharp(imageBuffer);

  // Get metadata to check if resize is needed
  const metadata = await sharpInstance.metadata();
  if (metadata.width && metadata.width > 1920) {
    sharpInstance = sharpInstance.resize(1920, null, {
      withoutEnlargement: true,
      fit: "inside",
    });
  }

  // Apply format-specific optimization
  if (outputFormat === "jpeg") {
    sharpInstance = sharpInstance.jpeg({ quality: 80, progressive: true });
  } else {
    sharpInstance = sharpInstance.png({ quality: 80, compressionLevel: 9 });
  }

  const processedBuffer = await sharpInstance.toBuffer();

  return {
    buffer: processedBuffer,
    mediaType,
    extension: outputFormat === "jpeg" ? "jpg" : "png",
  };
}
