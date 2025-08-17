import { Database } from "@/lib/types/database.types";

export interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

/**
 * Convert database prototype files to build worker format
 * Downloads binary assets and converts them to base64
 */
export async function convertPrototypeFilesForBuildWorker(
  prototypeFiles: Database["public"]["Tables"]["prototype_files"]["Row"][]
): Promise<FileInput[]> {
  const fileInputs: FileInput[] = [];

  for (const file of prototypeFiles) {
    if (file.file_type === "text") {
      // Text file - use contents directly
      fileInputs.push({
        path: file.name,
        content: file.contents!,
        isBase64: false,
      });
    } else if (file.file_type === "asset" && file.storage_path) {
      // Binary asset - fetch from Supabase Storage and convert to base64
      console.log(`🔍 Converting asset ${file.name} from storage_path: ${file.storage_path}`);
      try {
        const response = await fetch(file.storage_path);
        if (!response.ok) {
          console.error(`❌ Failed to fetch asset ${file.name}:`, response.statusText);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');
        console.log(`✅ Asset ${file.name} converted to base64 (${base64Content.length} chars)`);

        fileInputs.push({
          path: file.name,
          content: base64Content,
          isBase64: true,
        });
      } catch (error) {
        console.error(`❌ Error fetching asset ${file.name}:`, error);
        // Skip this asset if we can't fetch it
        continue;
      }
    } else if (file.file_type === "asset") {
      // Asset without storage_path - this shouldn't happen
      console.warn(`⚠️ Asset ${file.name} has no storage_path, skipping`);
    }
  }

  return fileInputs;
}

/**
 * Helper to check if a file is a binary asset based on extension
 */
export function isBinaryAssetFile(fileName: string): boolean {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.ttf', '.otf', '.woff', '.woff2', '.svg'];
  return binaryExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}

/**
 * Build worker API request types (matching server types)
 */
export interface PublicDevServerStartRequest {
  prototype_id: string;
  framework: 'expo_react_native' | 'react';
  files: FileInput[];
  file_scope: 'updates' | 'complete';
}

export interface CodeError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'runtime' | 'dependency' | 'syntax';
}

export interface CodeWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'deprecation' | 'performance' | 'unused';
}

export interface PublicDevServerStartResponse {
  status: 'success' | 'error';
  tunnel_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

export interface PublicDevServerStopRequest {
  prototype_id: string;
  s3_scoped_token?: string;
}

export interface PublicDevServerStopResponse {
  status: 'success' | 'error';
  build_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}