import { supabase } from "@/ClientConstants";

const SUPABASE_PROTOTYPE_ASSETS_BUCKET = "prototype-assets";

/**
 * Generate a signed URL for a prototype asset stored in Supabase Storage
 *
 * @param prototypeId - The unique prototype ID
 * @param assetName - The asset file name/path (e.g., "assets/images/test.png")
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns The signed URL for the asset, or null if generation fails
 */
export async function getAssetSignedUrl(
  prototypeId: string,
  assetName: string,
  expiresIn: number = 3600, // 1 hour default
): Promise<string | null> {
  try {
    // Construct the storage path: {prototypeId}/{assetName}
    const storagePath = `${prototypeId}/${assetName}`;

    const { data, error } = await supabase.storage
      .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      return null;
    }

    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

/**
 * Generate signed URLs for multiple assets in bulk
 *
 * @param prototypeId - The unique prototype ID
 * @param assetNames - Array of asset file names/paths
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Record mapping asset names to their signed URLs
 */
export async function getBulkAssetSignedUrls(
  prototypeId: string,
  assetNames: string[],
  expiresIn: number = 3600,
): Promise<Record<string, string | null>> {
  const urls = await Promise.all(
    assetNames.map(async (assetName) => ({
      assetName,
      url: await getAssetSignedUrl(prototypeId, assetName, expiresIn),
    })),
  );

  return urls.reduce(
    (acc, { assetName, url }) => {
      acc[assetName] = url;
      return acc;
    },
    {} as Record<string, string | null>,
  );
}

/**
 * Check if a file name represents an image asset
 */
export function isImageAsset(fileName: string): boolean {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(
    ext || "",
  );
}
