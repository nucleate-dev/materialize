export interface ProcessedImage {
  base64: string;
  mediaType: string;
}

// Max dimension supported by most LLM vision models
export const MAX_IMAGE_DIMENSION = 4096;

export async function processInputImage(
  base64Data: string,
  mediaType: string,
): Promise<ProcessedImage> {
  // For now, just pass through the image data
  // In the future, we can add sharp-based resizing/compression
  // The AI SDKs handle basic image processing internally

  // Validate the base64 data is reasonable
  if (!base64Data || base64Data.length === 0) {
    throw new Error('Empty image data provided');
  }

  // Validate media type
  const validMediaTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];
  const normalizedMediaType = mediaType.toLowerCase();
  if (!validMediaTypes.includes(normalizedMediaType)) {
    throw new Error(`Unsupported image media type: ${mediaType}`);
  }

  return {
    base64: base64Data,
    mediaType: normalizedMediaType,
  };
}

export async function fetchImageAsBase64(url: string): Promise<ProcessedImage> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // Extract the base media type (e.g., "image/jpeg" from "image/jpeg; charset=utf-8")
  const mediaType = contentType.split(';')[0].trim();

  return processInputImage(base64, mediaType);
}

export function isBase64Image(data: string): boolean {
  // Check if it looks like valid base64 data
  // Base64 should only contain alphanumeric chars, +, /, and = for padding
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(data);
}

export function estimateImageTokens(
  base64Data: string,
  provider: 'anthropic' | 'openai' | 'google',
): number {
  // Rough estimation of image tokens based on size
  // This varies by provider, but we use a conservative estimate

  const sizeInBytes = Buffer.from(base64Data, 'base64').length;
  const sizeInKb = sizeInBytes / 1024;

  // Anthropic: roughly 1 token per 750 bytes for images
  // OpenAI: varies based on detail level
  // Google: similar to Anthropic

  switch (provider) {
    case 'anthropic':
      return Math.ceil(sizeInBytes / 750);
    case 'openai':
      // OpenAI has a more complex calculation, use a middle estimate
      return Math.ceil(sizeInKb * 0.5);
    case 'google':
      return Math.ceil(sizeInBytes / 750);
    default:
      return Math.ceil(sizeInBytes / 750);
  }
}
