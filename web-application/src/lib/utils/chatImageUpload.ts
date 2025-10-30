/**
 * Utility for uploading and managing chat images in Supabase Storage
 * Images are stored in the 'chat-images' bucket with path: {user_id}/{prototype_id}/{timestamp}_{random}.{ext}
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
  } catch (error) {
    console.error("Failed to convert base64 to file:", error);
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
 * @param userId User ID for organizing storage
 * @param prototypeId Prototype ID for organizing storage
 * @returns Promise with upload result containing URL or error
 */
export async function uploadChatImage(
  imageData: string,
  userId: string,
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
    const filePath = `${userId}/${prototypeId}/${filename}`;

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
      console.error("Supabase storage upload error:", error);
      return {
        success: false,
        error: error.message || "Failed to upload image",
      };
    }

    // Get public URL for the uploaded image
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

    return {
      success: true,
      url: publicUrl,
    };
  } catch (error) {
    console.error("Error uploading chat image:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete an image from Supabase Storage
 * @param imageUrl The full public URL of the image
 * @param userId User ID (for permission checking)
 * @returns Promise indicating success or failure
 */
export async function deleteChatImage(
  imageUrl: string,
  userId: string,
): Promise<boolean> {
  try {
    // Extract file path from URL
    // URL format: https://{project}.supabase.co/storage/v1/object/public/chat-images/{path}
    const urlParts = imageUrl.split(`/object/public/${BUCKET_NAME}/`);
    if (urlParts.length !== 2) {
      console.error("Invalid image URL format:", imageUrl);
      return false;
    }

    const filePath = urlParts[1];

    // Verify the file belongs to this user (security check)
    if (!filePath.startsWith(`${userId}/`)) {
      console.error("Unauthorized: Image does not belong to user");
      return false;
    }

    // Delete from storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error("Failed to delete image:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting chat image:", error);
    return false;
  }
}

/**
 * Delete all images for a specific prototype
 * @param userId User ID
 * @param prototypeId Prototype ID
 * @returns Promise indicating success or failure
 */
export async function deletePrototypeImages(
  userId: string,
  prototypeId: string,
): Promise<boolean> {
  try {
    const folderPath = `${userId}/${prototypeId}`;

    // List all files in the prototype folder
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath);

    if (listError) {
      console.error("Failed to list prototype images:", listError);
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
      console.error("Failed to delete prototype images:", deleteError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting prototype images:", error);
    return false;
  }
}
