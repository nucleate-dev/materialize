/**
 * Utility for uploading and managing chat images in Supabase Storage
 * Images are stored in the 'chat-images' bucket with path: {prototype_id}/{timestamp}_{random}.{ext}
 */

import { supabase } from "@/ClientConstants";

const BUCKET_NAME = "chat-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Convert base64 data URI to File object
 */
function base64ToFile(base64: string, filename: string): File | null {
  try {
    // Extract the content type and base64 data
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    const contentType = matches[1];
    const base64Data = matches[2];

    // Convert base64 to binary
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    // Create File object
    return new File([array], filename, { type: contentType });
  } catch {
    return null;
  }
}

/**
 * Get file extension from base64 data URI
 */
function getFileExtension(base64: string): string {
  const matches = base64.match(/^data:image\/([A-Za-z]+);base64,/);
  if (matches && matches.length === 2) {
    return matches[1];
  }
  return "png"; // Default to PNG
}

/**
 * Upload an image to Supabase Storage
 * @param imageData Base64 data URI of the image
 * @param prototypeId Prototype ID for organizing storage
 * @returns Promise with upload result containing URL or error
 */
export async function uploadChatImage(
  imageData: string,
  prototypeId: string,
): Promise<ImageUploadResult> {
  try {
    // Validate image data
    if (!imageData || !imageData.startsWith("data:image/")) {
      return {
        success: false,
        error: "Invalid image data format",
      };
    }

    // Convert base64 to File
    const extension = getFileExtension(imageData);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}_${random}.${extension}`;
    const filePath = `${prototypeId}/${filename}`;

    const file = base64ToFile(imageData, filename);
    if (!file) {
      return {
        success: false,
        error: "Failed to convert image to file",
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Image too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      return {
        success: false,
        error: error.message || "Failed to upload image",
      };
    }

    // For private buckets, we need to create a signed URL that expires
    // Create a signed URL valid for 1 year (max allowed by Supabase)
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(data.path, 31536000); // 1 year in seconds

    if (signedUrlError || !signedUrlData) {
      return {
        success: false,
        error: "Failed to generate image URL",
      };
    }

    return {
      success: true,
      url: signedUrlData.signedUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get a fresh signed URL for an image (in case the stored URL expired)
 * @param imageUrlOrPath Either a signed URL or just the storage path
 * @returns Promise with fresh signed URL or null if error
 */
export async function getSignedImageUrl(
  imageUrlOrPath: string,
): Promise<string | null> {
  try {
    // Extract the file path from either a signed URL or plain path
    let filePath: string;

    if (imageUrlOrPath.includes("/object/sign/")) {
      // It's a signed URL, extract the path
      const pathMatch = imageUrlOrPath.match(/\/object\/sign\/[^/]+\/(.+)\?/);
      if (!pathMatch || !pathMatch[1]) {
        return null;
      }
      filePath = decodeURIComponent(pathMatch[1]);
    } else if (imageUrlOrPath.includes("/object/public/")) {
      // It's a public URL format, extract path
      const urlParts = imageUrlOrPath.split(`/object/public/${BUCKET_NAME}/`);
      if (urlParts.length !== 2) {
        return null;
      }
      filePath = urlParts[1];
    } else {
      // Assume it's already a path
      filePath = imageUrlOrPath;
    }

    // Generate fresh signed URL
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 31536000); // 1 year

    if (error || !data) {
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    return null;
  }
}

/**
 * Delete an image from Supabase Storage
 * @param imageUrl The full signed URL or storage path of the image
 * @returns Promise indicating success or failure
 */
export async function deleteChatImage(imageUrl: string): Promise<boolean> {
  try {
    // Extract file path from URL
    // URL format: https://{project}.supabase.co/storage/v1/object/public/chat-images/{path}
    const urlParts = imageUrl.split(`/object/public/${BUCKET_NAME}/`);
    if (urlParts.length !== 2) {
      return false;
    }

    const filePath = urlParts[1];

    // Delete from storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all images for a specific prototype
 * @param prototypeId Prototype ID
 * @returns Promise indicating success or failure
 */
export async function deletePrototypeImages(
  prototypeId: string,
): Promise<boolean> {
  try {
    const folderPath = prototypeId;

    // List all files in the prototype folder
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath);

    if (listError) {
      return false;
    }

    if (!files || files.length === 0) {
      return true; // No files to delete
    }

    // Delete all files
    const filePaths = files.map((file) => `${folderPath}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(filePaths);

    if (deleteError) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
