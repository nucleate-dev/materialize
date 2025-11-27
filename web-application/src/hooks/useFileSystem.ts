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

  // Single file operations
  saveSingleFile: (filePath: string) => Promise<boolean>;

  // File management operations (DB only, no rebuild)
  createFile: (fileName: string, initialContent?: string) => Promise<void>;
  deleteFile: (fileName: string) => Promise<void>;

  // File management operations with rebuild (calls /files/update-files)
  createFileWithBuild: (
    fileName: string,
    initialContent?: string,
  ) => Promise<{ success: boolean; viewingUrl?: string }>;
  deleteFileWithBuild: (
    fileName: string,
  ) => Promise<{ success: boolean; viewingUrl?: string }>;

  // Asset management operations with rebuild
  uploadAssetsWithBuild: (
    assets: { path: string; file: File }[],
  ) => Promise<{ success: boolean; viewingUrl?: string }>;
  deleteAssetWithBuild: (assetPath: string) => Promise<{
    success: boolean;
    viewingUrl?: string;
  }>;
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

  // Save a single file to the database
  const saveSingleFile = useCallback(
    async (filePath: string): Promise<boolean> => {
      if (!prototypeId) {
        logger.debug("error", "Cannot save file: no prototype ID");
        return false;
      }

      const fileData = files[filePath];
      if (!fileData) {
        logger.debug(
          "error",
          "Cannot save file: file not found in local state:",
          {
            filePath,
          },
        );
        return false;
      }

      try {
        // Prepare single file for database upsert
        const fileToUpsert = {
          id: fileData.id,
          name: filePath,
          contents: fileData.contents,
          prototype_id: fileData.prototype_id || prototypeId,
          created_at: fileData.created_at,
          updated_at: new Date().toISOString(),
        };

        // Use Supabase upsert to insert new file or update existing one
        const { error } = await supabase
          .from("prototype_files")
          .upsert([fileToUpsert], {
            onConflict: "name,prototype_id",
            ignoreDuplicates: false,
          })
          .select();

        if (error) {
          logger.debug("error", "Error persisting single file to database:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          return false;
        }

        return true;
      } catch (error) {
        logger.debug("error", "Error in saveSingleFile:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return false;
      }
    },
    [prototypeId, files, logger],
  );

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

  // Create a new file and trigger rebuild via /files/update-files
  const createFileWithBuild = useCallback(
    async (
      fileName: string,
      initialContent = "",
    ): Promise<{ success: boolean; viewingUrl?: string }> => {
      // Prevent file creation for free users
      if (userPlan === "free") {
        logger.debug(
          "error",
          "Create file failed: free users cannot create files",
        );
        return { success: false };
      }

      if (!prototypeId) {
        logger.debug("error", "Create file failed: no prototype ID");
        return { success: false };
      }

      if (files[fileName]) {
        logger.debug("error", "File already exists:", {
          fileName,
        });
        return { success: false };
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
          return { success: false };
        }

        // Update local state
        setFiles((prevFiles) => ({
          ...prevFiles,
          [fileName]: newFile,
        }));

        // Select the new file
        setSelectedFile(fileName);

        // Call /files/update-files to trigger rebuild
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          logger.debug("error", "No authentication token available");
          return { success: true }; // File created but no rebuild triggered
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              files: [
                {
                  contents: initialContent,
                  name: fileName,
                  prototype_id: prototypeId,
                  id: newFile.id,
                  created_at: newFile.created_at,
                  updated_at: newFile.updated_at,
                },
              ],
              assets: [],
              prototype_id: prototypeId,
            }),
          },
        );

        if (!response.ok) {
          logger.debug(
            "error",
            "Failed to trigger rebuild after file creation",
          );
          return { success: true }; // File created but rebuild failed
        }

        const result = await response.json();
        return {
          success: true,
          viewingUrl: result.data?.viewing_url,
        };
      } catch (error) {
        logger.debug("error", `Error creating file ${fileName}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { success: false };
      }
    },
    [prototypeId, files, logger, userPlan],
  );

  // Delete a file and trigger rebuild via /files/update-files
  const deleteFileWithBuild = useCallback(
    async (
      fileName: string,
    ): Promise<{ success: boolean; viewingUrl?: string }> => {
      // Prevent file deletion for free users
      if (userPlan === "free") {
        logger.debug(
          "error",
          "Delete file failed: free users cannot delete files",
        );
        return { success: false };
      }

      if (!prototypeId) {
        logger.debug("error", "Delete file failed: no prototype ID");
        return { success: false };
      }

      const fileToDelete = files[fileName];
      if (!fileToDelete) {
        logger.debug("error", "File not found:", {
          fileName,
        });
        return { success: false };
      }

      // Prevent deleting the last file
      if (Object.keys(files).length <= 1) {
        logger.debug("error", "Cannot delete the last file");
        return { success: false };
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
          return { success: false };
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

        // Call /files/update-files to trigger rebuild
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          logger.debug("error", "No authentication token available");
          return { success: true }; // File deleted but no rebuild triggered
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              files: [],
              assets: [],
              prototype_id: prototypeId,
              deleted_files: [fileName],
            }),
          },
        );

        if (!response.ok) {
          logger.debug(
            "error",
            "Failed to trigger rebuild after file deletion",
          );
          return { success: true }; // File deleted but rebuild failed
        }

        const result = await response.json();
        return {
          success: true,
          viewingUrl: result.data?.viewing_url,
        };
      } catch (error) {
        logger.debug("error", `Error deleting file ${fileName}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { success: false };
      }
    },
    [prototypeId, files, selectedFile, logger, userPlan],
  );

  const uploadAssetsWithBuild = useCallback(
    async (
      assetsToUpload: { path: string; file: File }[],
    ): Promise<{ success: boolean; viewingUrl?: string }> => {
      if (!prototypeId) {
        logger.debug("error", "Upload assets failed: no prototype ID");
        return { success: false };
      }

      if (assetsToUpload.length === 0) {
        return { success: true };
      }

      try {
        // Upload to Supabase storage first
        const uploadResults: PrototypeAssetInsert[] = [];
        for (const asset of assetsToUpload) {
          const storagePath = `${prototypeId}/${asset.path}`;
          const { error: uploadError } = await supabase.storage
            .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
            .upload(storagePath, asset.file, {
              upsert: true,
              contentType: asset.file.type || undefined,
            });

          if (uploadError) {
            logger.debug("error", "Failed to upload asset to storage", {
              assetPath: asset.path,
              error: uploadError.message,
            });
            continue;
          }

          uploadResults.push({
            prototype_id: prototypeId,
            name: asset.path,
            storage_url: storagePath,
            updated_at: new Date().toISOString(),
          });
        }

        if (uploadResults.length === 0) {
          return { success: false };
        }

        // Upsert metadata into prototype_assets table
        const { data: upsertedAssets, error: dbError } = await supabase
          .from("prototype_assets")
          .upsert(uploadResults, {
            onConflict: "prototype_id,name",
          })
          .select();

        if (dbError) {
          logger.debug("error", "Failed to upsert prototype_assets metadata", {
            error: dbError.message,
          });
          return { success: false };
        }

        // Prepare payload for dev server (with base64 contents)
        const successfulAssetNames = new Set(
          uploadResults.map((asset) => asset.name),
        );
        const assetsPayload: Array<
          PrototypeAssetInsert & { contents: string }
        > = [];
        for (const asset of assetsToUpload) {
          if (!successfulAssetNames.has(asset.path)) continue;
          const base64 = await fileToBase64(asset.file);
          assetsPayload.push({
            prototype_id: prototypeId,
            name: asset.path,
            storage_url: `${prototypeId}/${asset.path}`,
            contents: base64,
            updated_at: new Date().toISOString(),
          });
        }

        // Refresh signed URLs for uploaded assets
        if (upsertedAssets && upsertedAssets.length > 0) {
          const signedUrls = await getBulkAssetSignedUrls(
            prototypeId,
            upsertedAssets.map((a) => a.name),
          );
          setAssets((prev) => {
            const next = { ...prev };
            upsertedAssets.forEach((asset) => {
              next[asset.name] = {
                ...asset,
                storage_url: signedUrls[asset.name],
              };
            });
            return next;
          });
        }

        // Send to dev server
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          logger.debug("error", "No authentication token available");
          return { success: true };
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              files: [],
              assets: assetsPayload,
              prototype_id: prototypeId,
            }),
          },
        );

        if (!response.ok) {
          logger.debug(
            "error",
            "Failed to trigger dev server update for assets",
          );
          return { success: true };
        }

        const result = await response.json();
        return {
          success: true,
          viewingUrl: result.data?.viewing_url,
        };
      } catch (error) {
        logger.debug("error", "Error uploading assets with build", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { success: false };
      }
    },
    [prototypeId, logger, fileToBase64, SUPABASE_PROTOTYPE_ASSETS_BUCKET],
  );

  const deleteAssetWithBuild = useCallback(
    async (
      assetPath: string,
    ): Promise<{ success: boolean; viewingUrl?: string }> => {
      if (!prototypeId) {
        logger.debug("error", "Delete asset failed: no prototype ID");
        return { success: false };
      }

      try {
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
        const { data: deletedRecords, error: dbError } = await supabase
          .from("prototype_assets")
          .delete()
          .eq("prototype_id", prototypeId)
          .eq("name", assetPath)
          .select();

        if (dbError) {
          logger.debug("error", "Failed to delete asset from database", {
            assetPath,
            error: dbError.message,
          });
          return { success: false };
        }

        setAssets((prevAssets) => {
          const next = { ...prevAssets };
          delete next[assetPath];
          return next;
        });

        if (selectedFile === assetPath) {
          // Fallback to a file if current selection was removed
          const remainingFiles = Object.keys(files);
          const remainingAssets = Object.keys(assets).filter(
            (asset) => asset !== assetPath,
          );
          const nextSelection =
            remainingFiles[0] || remainingAssets[0] || defaultFile;
          setSelectedFile(nextSelection);
        }

        // Notify dev server about deletion
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          logger.debug("error", "No authentication token available");
          return { success: true };
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              files: [],
              assets: [],
              prototype_id: prototypeId,
              deleted_files: [assetPath],
            }),
          },
        );

        if (!response.ok) {
          logger.debug(
            "error",
            "Failed to trigger dev server update after asset deletion",
          );
          return { success: true };
        }

        const result = await response.json();
        return {
          success: true,
          viewingUrl: result.data?.viewing_url,
        };
      } catch (error) {
        logger.debug("error", `Error deleting asset ${assetPath}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { success: false };
      }
    },
    [
      prototypeId,
      logger,
      SUPABASE_PROTOTYPE_ASSETS_BUCKET,
      selectedFile,
      files,
      assets,
      defaultFile,
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
    saveSingleFile,
    createFile,
    deleteFile,
    createFileWithBuild,
    deleteFileWithBuild,
    uploadAssetsWithBuild,
    deleteAssetWithBuild,
  };

  return {
    state,
    ...actions,
  };
};
