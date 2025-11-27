import { supabase } from "@/ClientConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { getBulkAssetSignedUrls } from "@/lib/utils/assetUtils";
import { useCallback, useEffect, useState } from "react";

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];
type PrototypeAssetInsert =
  Database["public"]["Tables"]["prototype_assets"]["Insert"];

export interface AssetWithSignedUrl
  extends Omit<PrototypeAsset, "storage_url"> {
  storage_url?: string | null;
}

export interface FileSystemState {
  files: Record<string, PrototypeFile>;
  assets: Record<string, AssetWithSignedUrl>;
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

  // Database operations
  loadFilesFromDatabase: (prototypeId: string) => Promise<void>;
  loadAssetsFromDatabase: (prototypeId: string) => Promise<void>;

  // File management operations (DB only, no rebuild)
  createFile: (fileName: string, initialContent?: string) => Promise<void>;

  // Unified function to sync all file/asset operations in one batch
  syncFilesAndAssets: (params: {
    filesToCreate?: Array<{ name: string; content: string }>;
    filesToUpdate?: Array<{ name: string; content: string }>;
    filesToDelete?: string[];
    assetsToUpload?: Array<{ path: string; file: File }>;
    assetsToDelete?: string[];
  }) => Promise<{ success: boolean }>;
}

export interface UseFileSystemReturn extends FileSystemActions {
  state: FileSystemState;
}

export const useFileSystem = (
  prototypeId: string | undefined,
  defaultFile = "App.js",
): UseFileSystemReturn => {
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();
  const [files, setFiles] = useState<Record<string, PrototypeFile>>({});
  const [assets, setAssets] = useState<Record<string, AssetWithSignedUrl>>({});
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);
  const [isLoading, setIsLoading] = useState(false);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const SUPABASE_PROTOTYPE_ASSETS_BUCKET = "prototype-assets";

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

        // Get signed URLs for all assets
        const assetNames = (data || []).map((asset) => asset.name);
        const signedUrls = await getBulkAssetSignedUrls(
          prototypeId,
          assetNames,
        );

        // Convert array to dictionary mapping name to AssetWithSignedUrl object
        const assetsDict = (data || []).reduce(
          (acc, asset) => {
            acc[asset.name] = {
              ...asset,
              storage_url: signedUrls[asset.name],
            };
            return acc;
          },
          {} as Record<string, AssetWithSignedUrl>,
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
        async (payload) => {
          const newAsset = payload.new as PrototypeAsset;
          // Get signed URL for the new asset
          const signedUrls = await getBulkAssetSignedUrls(prototypeId, [
            newAsset.name,
          ]);
          setAssets((prevAssets) => ({
            ...prevAssets,
            [newAsset.name]: {
              ...newAsset,
              storage_url: signedUrls[newAsset.name],
            },
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
        async (payload) => {
          const updatedAsset = payload.new as PrototypeAsset;
          // Get signed URL for the updated asset
          const signedUrls = await getBulkAssetSignedUrls(prototypeId, [
            updatedAsset.name,
          ]);
          setAssets((prevAssets) => ({
            ...prevAssets,
            [updatedAsset.name]: {
              ...updatedAsset,
              storage_url: signedUrls[updatedAsset.name],
            },
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

  // Create a new file
  const createFile = useCallback(
    async (fileName: string, initialContent = "") => {
      // Prevent file creation for free users
      if (userPlan === "free") {
        logger.debug(
          "error",
          "Create file failed: free users cannot create files",
        );
        return;
      }

      if (!prototypeId) {
        logger.debug("error", "Create file failed: no prototype ID");
        return;
      }

      if (files[fileName]) {
        logger.debug("error", "File already exists:", {
          fileName,
        });
        return;
      }

      try {
        // Create file in database
        const { data: newFile, error } = await supabase
          .from("prototype_files")
          .insert({
            prototype_id: prototypeId,
            name: fileName,
            contents: initialContent,
          })
          .select()
          .single();

        if (error) {
          logger.debug("error", `Error creating file ${fileName}:`, {
            ...error,
          });
          return;
        }

        // Update local state
        setFiles((prevFiles) => ({
          ...prevFiles,
          [fileName]: newFile,
        }));

        // Select the new file
        setSelectedFile(fileName);
      } catch (error) {
        logger.debug("error", `Error creating file ${fileName}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    [prototypeId, files, logger, userPlan],
  );

  // Delete a file
  const deleteFile = useCallback(
    async (fileName: string) => {
      // Prevent file deletion for free users
      if (userPlan === "free") {
        logger.debug(
          "error",
          "Delete file failed: free users cannot delete files",
        );
        return;
      }

      if (!prototypeId) {
        logger.debug("error", "Delete file failed: no prototype ID");
        return;
      }

      const fileToDelete = files[fileName];
      if (!fileToDelete) {
        logger.debug("error", "File not found:", {
          fileName,
        });
        return;
      }

      // Prevent deleting the last file
      if (Object.keys(files).length <= 1) {
        logger.debug("error", "Cannot delete the last file");
        return;
      }

      try {
        // Delete file from database
        const { error } = await supabase
          .from("prototype_files")
          .delete()
          .eq("id", fileToDelete.id);

        if (error) {
          logger.debug("error", `Error deleting file ${fileName}:`, {
            ...error,
          });
          return;
        }

        // Update local state
        const newFiles = { ...files };
        delete newFiles[fileName];
        setFiles(newFiles);

        // If the deleted file was selected, select another file
        if (selectedFile === fileName) {
          const remainingFiles = Object.keys(newFiles);
          if (remainingFiles.length > 0) {
            setSelectedFile(remainingFiles[0]);
          }
        }
      } catch (error) {
        logger.debug("error", `Error deleting file ${fileName}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    [prototypeId, files, selectedFile, logger, userPlan],
  );

  // Unified function to sync all file/asset operations in one batch
  const syncFilesAndAssets = useCallback(
    async (params: {
      filesToCreate?: Array<{ name: string; content: string }>;
      filesToUpdate?: Array<{ name: string; content: string }>;
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
        filesToCreate = [],
        filesToUpdate = [],
        filesToDelete = [],
        assetsToUpload = [],
        assetsToDelete = [],
      } = params;

      try {
        // Track all file and asset names for the sandbox call
        const allFileNames: string[] = [];
        const allAssetNames: string[] = [];

        // 1. Create new files in Supabase
        // Realtime subscription will automatically update local state
        for (const fileToCreate of filesToCreate) {
          if (files[fileToCreate.name]) {
            logger.debug("error", "File already exists:", {
              fileName: fileToCreate.name,
            });
            continue;
          }

          const { error } = await supabase
            .from("prototype_files")
            .insert({
              prototype_id: prototypeId,
              name: fileToCreate.name,
              contents: fileToCreate.content,
            });

          if (error) {
            logger.debug("error", `Error creating file ${fileToCreate.name}:`, {
              ...error,
            });
            continue;
          }

          allFileNames.push(fileToCreate.name);
        }

        // 2. Update existing files in Supabase
        // Realtime subscription will automatically update local state
        for (const fileToUpdate of filesToUpdate) {
          const existingFile = files[fileToUpdate.name];
          if (!existingFile) {
            logger.debug("error", "File not found for update:", {
              fileName: fileToUpdate.name,
            });
            continue;
          }

          const { error } = await supabase
            .from("prototype_files")
            .update({
              contents: fileToUpdate.content,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingFile.id);

          if (error) {
            logger.debug("error", `Error updating file ${fileToUpdate.name}:`, {
              ...error,
            });
            continue;
          }

          allFileNames.push(fileToUpdate.name);
        }

        // 3. Delete files from Supabase
        // Realtime subscription will automatically update local state
        for (const fileName of filesToDelete) {
          const fileToDelete = files[fileName];
          if (!fileToDelete) {
            logger.debug("error", "File not found for deletion:", {
              fileName,
            });
            continue;
          }

          const { error } = await supabase
            .from("prototype_files")
            .delete()
            .eq("id", fileToDelete.id);

          if (error) {
            logger.debug("error", `Error deleting file ${fileName}:`, {
              ...error,
            });
            continue;
          }
        }

        // 4. Upload assets to Supabase storage
        // Realtime subscription will automatically update local state
        for (const assetToUpload of assetsToUpload) {
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
            continue;
          }

          // Upsert metadata into prototype_assets table
          const { error: dbError } = await supabase
            .from("prototype_assets")
            .upsert(
              {
                prototype_id: prototypeId,
                name: assetToUpload.path,
                storage_url: storagePath,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "prototype_id,name",
              },
            );

          if (dbError) {
            logger.debug("error", "Failed to upsert asset metadata", {
              assetPath: assetToUpload.path,
              error: dbError.message,
            });
            continue;
          }

          allAssetNames.push(assetToUpload.path);
        }

        // 5. Delete assets from Supabase
        // Realtime subscription will automatically update local state
        for (const assetPath of assetsToDelete) {
          // Remove from storage
          const { error: storageError } = await supabase.storage
            .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
            .remove([`${prototypeId}/${assetPath}`]);

          if (storageError) {
            logger.debug("error", "Failed to delete asset from storage", {
              assetPath,
              error: storageError.message,
            });
          }

          // Delete from database
          const { error: dbError } = await supabase
            .from("prototype_assets")
            .delete()
            .eq("prototype_id", prototypeId)
            .eq("name", assetPath);

          if (dbError) {
            logger.debug("error", "Failed to delete asset from database", {
              assetPath,
              error: dbError.message,
            });
            continue;
          }
        }

        // 6. Send ONE request to sandbox /update-files-v2 with all changes
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
    loadFilesFromDatabase,
    loadAssetsFromDatabase,
    createFile,
    syncFilesAndAssets,
  };

  return {
    state,
    ...actions,
  };
};
