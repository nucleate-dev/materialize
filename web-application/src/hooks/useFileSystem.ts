import { supabase } from "@/ClientConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { useCallback, useEffect, useState } from "react";

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];
type PrototypeAssetInsert =
  Database["public"]["Tables"]["prototype_assets"]["Insert"];

export interface FileSystemState {
  files: Record<string, PrototypeFile>;
  assets: Record<string, PrototypeAsset>;
  selectedFile: string;
  isLoading: boolean;
  sandboxUrl: string | null;
}

export interface FileSystemActions {
  // File selection and content management
  selectFile: (filePath: string) => void;
  updateFileContentLocally: (filePath: string, content: string) => void;
  getSelectedFileContent: () => string;

  // Sandbox URL management
  setSandboxUrl: (url: string | null) => void;

  // Unified function to sync all file/asset operations in one batch
  syncFilesAndAssets: (params: {
    filesToUpsert?: Array<{ name: string; content: string }>;
    filesToDelete?: string[];
    assetsToUpload?: Array<{ path: string; file: File }>;
    assetsToDelete?: string[];
  }) => Promise<{ success: boolean }>;
}

export interface UseFileSystemReturn extends FileSystemActions {
  state: FileSystemState;
}

// Batch configuration for Supabase operations
const BATCH_CONFIG = {
  FILE_UPSERT_BATCH_SIZE: 100, // Files per batch for upsert
  ASSET_UPLOAD_CONCURRENCY: 5, // Parallel asset uploads
  BATCH_DELAY_MS: 50, // Delay between batches (ms)
} as const;

export const useFileSystem = (
  prototypeId: string | undefined,
  defaultFile = "App.js",
): UseFileSystemReturn => {
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();
  const [files, setFiles] = useState<Record<string, PrototypeFile>>({});
  const [assets, setAssets] = useState<Record<string, PrototypeAsset>>({});
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);
  const [isLoading, setIsLoading] = useState(false);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const SUPABASE_PROTOTYPE_ASSETS_BUCKET = "prototype-assets";

  // Utility function to split array into chunks for batching
  const chunkArray = useCallback(<T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }, []);

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }, []);

  // Load files from database
  const loadFilesFromDatabase = useCallback(
    async (prototypeId: string) => {
      if (!prototypeId) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("prototype_files")
          .select("*")
          .eq("prototype_id", prototypeId)
          .order("created_at", { ascending: true });

        if (error) {
          logger.debug("error", "Error fetching prototype files:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          return;
        }

        // Convert array to dictionary mapping name to PrototypeFile object
        const filesDict = (data || []).reduce(
          (acc, file) => {
            acc[file.name] = file;
            return acc;
          },
          {} as Record<string, PrototypeFile>,
        );

        setFiles(filesDict);

        // Set selected file to default if it exists, otherwise keep current selection
        if (filesDict[defaultFile] && selectedFile === defaultFile) {
          // File exists and we're still on default - no change needed
        } else if (!filesDict[selectedFile]) {
          // Current selection doesn't exist, fallback to default or first available
          const availableFile =
            filesDict[defaultFile] || Object.keys(filesDict)[0];
          if (availableFile) {
            setSelectedFile(availableFile);
          }
        }
      } catch (error) {
        logger.debug("error", "Error loading files:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [defaultFile, selectedFile, logger],
  );

  const loadAssetsFromDatabase = useCallback(
    async (prototypeId: string) => {
      if (!prototypeId) return;

      try {
        const { data, error } = await supabase
          .from("prototype_assets")
          .select("*")
          .eq("prototype_id", prototypeId)
          .order("created_at", { ascending: true });

        if (error) {
          logger.debug("error", "Error fetching prototype assets:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          return;
        }

        // Convert array to dictionary mapping name to PrototypeAsset object
        const assetsDict = (data || []).reduce(
          (acc, asset) => {
            acc[asset.name] = asset;
            return acc;
          },
          {} as Record<string, PrototypeAsset>,
        );

        setAssets(assetsDict);
      } catch (error) {
        logger.debug("error", "Error loading assets:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    [logger],
  );

  useEffect(() => {
    if (!prototypeId) return;
    loadFilesFromDatabase(prototypeId);
    loadAssetsFromDatabase(prototypeId);

    // Set up realtime subscriptions for collaborative editing
    const filesChannel = supabase
      .channel(`prototype_files:${prototypeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prototype_files",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const newFile = payload.new as PrototypeFile;
          setFiles((prevFiles) => ({
            ...prevFiles,
            [newFile.name]: newFile,
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "prototype_files",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const updatedFile = payload.new as PrototypeFile;
          // Overwrite local changes with remote changes
          setFiles((prevFiles) => ({
            ...prevFiles,
            [updatedFile.name]: updatedFile,
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "prototype_files",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const deletedFile = payload.old as PrototypeFile;
          setFiles((prevFiles) => {
            const newFiles = { ...prevFiles };
            delete newFiles[deletedFile.name];
            return newFiles;
          });

          // If deleted file was selected, select another file
          if (selectedFile === deletedFile.name) {
            setFiles((prevFiles) => {
              const remainingFiles = Object.keys(prevFiles).filter(
                (f) => f !== deletedFile.name,
              );
              if (remainingFiles.length > 0) {
                setSelectedFile(remainingFiles[0]);
              } else {
                setSelectedFile(defaultFile);
              }
              return prevFiles;
            });
          }
        },
      )
      .subscribe();

    const assetsChannel = supabase
      .channel(`prototype_assets:${prototypeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prototype_assets",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const newAsset = payload.new as PrototypeAsset;
          setAssets((prevAssets) => ({
            ...prevAssets,
            [newAsset.name]: newAsset,
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "prototype_assets",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const updatedAsset = payload.new as PrototypeAsset;
          setAssets((prevAssets) => ({
            ...prevAssets,
            [updatedAsset.name]: updatedAsset,
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "prototype_assets",
          filter: `prototype_id=eq.${prototypeId}`,
        },
        (payload) => {
          const deletedAsset = payload.old as PrototypeAsset;
          setAssets((prevAssets) => {
            const newAssets = { ...prevAssets };
            delete newAssets[deletedAsset.name];
            return newAssets;
          });
        },
      )
      .subscribe();

    // Cleanup subscriptions on unmount or when prototypeId changes
    return () => {
      supabase.removeChannel(filesChannel);
      supabase.removeChannel(assetsChannel);
    };
  }, [
    prototypeId,
    loadFilesFromDatabase,
    loadAssetsFromDatabase,
    logger,
    defaultFile,
    selectedFile,
  ]);

  // File selection
  const selectFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
  }, []);

  // Update file content in local state
  const updateFileContentLocally = useCallback(
    (filePath: string, content: string) => {
      setFiles((prevFiles) => ({
        ...prevFiles,
        [filePath]: {
          ...prevFiles[filePath],
          contents: content,
          updated_at: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const getSelectedFileContent = useCallback((): string => {
    return files[selectedFile]?.contents || "";
  }, [files, selectedFile]);

  // Unified function to sync all file/asset operations in one batch
  const syncFilesAndAssets = useCallback(
    async (params: {
      filesToUpsert?: Array<{ name: string; content: string }>;
      filesToDelete?: string[];
      assetsToUpload?: Array<{ path: string; file: File }>;
      assetsToDelete?: string[];
    }): Promise<{ success: boolean }> => {
      // Prevent operations for free users
      if (userPlan === "free") {
        logger.debug(
          "error",
          "File/asset operations failed: free users cannot modify files",
        );
        return { success: false };
      }

      if (!prototypeId) {
        logger.debug("error", "File/asset operations failed: no prototype ID");
        return { success: false };
      }

      const {
        filesToUpsert = [],
        filesToDelete = [],
        assetsToUpload = [],
        assetsToDelete = [],
      } = params;

      try {
        // Track all file and asset names for the sandbox call
        const allFileNames: string[] = [];
        const allAssetNames: string[] = [];

        // 1. Upsert files in Supabase with batching
        // Realtime subscription will automatically update local state
        if (filesToUpsert.length > 0) {
          const chunks = chunkArray(
            filesToUpsert,
            BATCH_CONFIG.FILE_UPSERT_BATCH_SIZE,
          );

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const filesToUpsertPayload = chunk.map((file) => ({
              prototype_id: prototypeId,
              name: file.name,
              contents: file.content,
              updated_at: new Date().toISOString(),
            }));

            const { error } = await supabase
              .from("prototype_files")
              .upsert(filesToUpsertPayload, {
                onConflict: "prototype_id,name",
                ignoreDuplicates: false,
              });

            if (error) {
              logger.debug("error", "Error upserting file batch:", {
                batchIndex: i + 1,
                filesCount: chunk.length,
                error,
              });
            } else {
              // Add successfully upserted file names
              allFileNames.push(...chunk.map((f) => f.name));
            }

            // Small delay between batches
            if (i < chunks.length - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
              );
            }
          }
        }

        // 2. Delete files from Supabase with bulk operation
        // Realtime subscription will automatically update local state
        if (filesToDelete.length > 0) {
          // Use bulk delete with .in() for efficiency
          const { error } = await supabase
            .from("prototype_files")
            .delete()
            .eq("prototype_id", prototypeId)
            .in("name", filesToDelete);

          if (error) {
            logger.debug("error", "Error bulk deleting files:", {
              filesCount: filesToDelete.length,
              error,
            });
          }
        }

        // 3. Upload assets to Supabase storage with controlled concurrency
        // Realtime subscription will automatically update local state
        if (assetsToUpload.length > 0) {
          const successfulUploads: Array<PrototypeAssetInsert> = [];

          // Process assets in chunks for controlled concurrency
          const uploadChunks = chunkArray(
            assetsToUpload,
            BATCH_CONFIG.ASSET_UPLOAD_CONCURRENCY,
          );

          for (const uploadChunk of uploadChunks) {
            // Upload all assets in this chunk in parallel
            await Promise.all(
              uploadChunk.map(async (assetToUpload) => {
                try {
                  const storagePath = `${prototypeId}/${assetToUpload.path}`;
                  const { error: uploadError } = await supabase.storage
                    .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
                    .upload(storagePath, assetToUpload.file, {
                      upsert: true,
                      contentType: assetToUpload.file.type || undefined,
                    });

                  if (uploadError) {
                    logger.debug("error", "Failed to upload asset to storage", {
                      assetPath: assetToUpload.path,
                      error: uploadError.message,
                    });
                    return;
                  }

                  // Track successful upload for bulk metadata upsert
                  successfulUploads.push({
                    prototype_id: prototypeId,
                    name: assetToUpload.path,
                    updated_at: new Date().toISOString(),
                  });
                } catch (error) {
                  logger.debug("error", "Error uploading asset", {
                    assetPath: assetToUpload.path,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }),
            );
          }

          // Bulk upsert metadata for all successfully uploaded assets
          if (successfulUploads.length > 0) {
            const { error: dbError } = await supabase
              .from("prototype_assets")
              .upsert(successfulUploads, {
                onConflict: "prototype_id,name",
              });

            if (dbError) {
              logger.debug("error", "Failed to bulk upsert asset metadata", {
                assetsCount: successfulUploads.length,
                error: dbError.message,
              });
            } else {
              // Add successfully uploaded asset names
              allAssetNames.push(...successfulUploads.map((a) => a.name));
            }
          }
        }

        // 4. Delete assets from Supabase with bulk operations
        // Realtime subscription will automatically update local state
        if (assetsToDelete.length > 0) {
          // Bulk delete from storage
          const storagePaths = assetsToDelete.map(
            (assetPath) => `${prototypeId}/${assetPath}`,
          );
          const { error: storageError } = await supabase.storage
            .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
            .remove(storagePaths);

          if (storageError) {
            logger.debug("error", "Failed to bulk delete assets from storage", {
              assetsCount: assetsToDelete.length,
              error: storageError.message,
            });
          }

          // Bulk delete from database
          const { error: dbError } = await supabase
            .from("prototype_assets")
            .delete()
            .eq("prototype_id", prototypeId)
            .in("name", assetsToDelete);

          if (dbError) {
            logger.debug(
              "error",
              "Failed to bulk delete assets from database",
              {
                assetsCount: assetsToDelete.length,
                error: dbError.message,
              },
            );
          }
        }

        // 5. Send ONE request to sandbox /update-files-v2 with all changes
        if (!sandboxUrl) {
          logger.debug("error", "No sandbox URL available");
          return { success: true }; // DB operations succeeded but no rebuild
        }

        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          logger.debug("error", "No authentication token available");
          return { success: true }; // DB operations succeeded but no rebuild
        }

        // Only call sandbox if there are actual changes
        if (
          allFileNames.length > 0 ||
          allAssetNames.length > 0 ||
          filesToDelete.length > 0 ||
          assetsToDelete.length > 0
        ) {
          const response = await fetch(`${sandboxUrl}/update-files-v2`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prototype_id: prototypeId,
              file_names: allFileNames,
              asset_names: allAssetNames,
              deleted_file_names: filesToDelete,
              deleted_asset_names: assetsToDelete,
            }),
          });

          if (!response.ok) {
            logger.debug("error", "Failed to sync files to sandbox");
            return { success: true }; // DB operations succeeded but sandbox sync failed
          }
        }

        return { success: true };
      } catch (error) {
        logger.debug("error", "Error in syncFilesAndAssets:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { success: false };
      }
    },
    [
      prototypeId,
      files,
      assets,
      selectedFile,
      defaultFile,
      logger,
      userPlan,
      sandboxUrl,
      SUPABASE_PROTOTYPE_ASSETS_BUCKET,
      chunkArray,
    ],
  );

  const state: FileSystemState = {
    files,
    assets,
    selectedFile,
    isLoading,
    sandboxUrl,
  };

  const actions: FileSystemActions = {
    selectFile,
    updateFileContentLocally,
    getSelectedFileContent,
    setSandboxUrl,
    syncFilesAndAssets,
  };

  return {
    state,
    ...actions,
  };
};
