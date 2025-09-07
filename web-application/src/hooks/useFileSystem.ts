import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { useCallback, useEffect, useState } from "react";

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

export interface FileSystemState {
  files: Record<string, PrototypeFile>;
  assets: Record<string, PrototypeAsset>;
  selectedFile: string;
  isLoading: boolean;
}

export interface FileSystemActions {
  // File selection and content management
  selectFile: (filePath: string) => void;
  updateFileContentLocally: (filePath: string, content: string) => void;
  getSelectedFileContent: () => string;

  // Database operations
  loadFilesFromDatabase: (prototypeId: string) => Promise<void>;
  loadAssetsFromDatabase: (prototypeId: string) => Promise<void>;

  // Single file operations
  saveSingleFile: (filePath: string) => Promise<boolean>;

  // Bulk file operations
  applyAndPersistFileUpdates: (
    updatedFiles: Record<string, PrototypeFile>,
  ) => Promise<boolean>;

  // File management operations
  createFile: (fileName: string, initialContent?: string) => Promise<void>;
  deleteFile: (fileName: string) => Promise<void>;
}

export interface UseFileSystemReturn extends FileSystemActions {
  state: FileSystemState;
}

export const useFileSystem = (
  prototypeId: string | undefined,
  defaultFile = "App.js",
): UseFileSystemReturn => {
  const logger = useProductLogger();
  const [files, setFiles] = useState<Record<string, PrototypeFile>>({});
  const [assets, setAssets] = useState<Record<string, PrototypeAsset>>({});
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);
  const [isLoading, setIsLoading] = useState(false);

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
  }, [prototypeId, loadFilesFromDatabase, loadAssetsFromDatabase]);

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

  // Apply file updates from external sources (like chat API responses)
  const applyFileUpdates = useCallback(
    (updatedFiles: Record<string, PrototypeFile>) => {
      // Update local state only
      setFiles((prevFiles) => {
        const newFiles = { ...prevFiles };
        Object.entries(updatedFiles).forEach(([filePath, fileData]) => {
          newFiles[filePath] = fileData;
        });
        return JSON.parse(JSON.stringify(newFiles)); // Deep copy for React detection
      });
    },
    [],
  );

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

  // Apply file updates locally and persist them directly to Supabase database
  const applyAndPersistFileUpdates = useCallback(
    async (updatedFiles: Record<string, PrototypeFile>): Promise<boolean> => {
      if (!prototypeId) {
        logger.debug("error", "Cannot persist file updates: no prototype ID");
        return false;
      }

      if (!updatedFiles || Object.keys(updatedFiles).length === 0) {
        return false;
      }

      try {
        // First, apply updates locally
        applyFileUpdates(updatedFiles);

        // Prepare files for database upsert
        const filesToUpsert = Object.entries(updatedFiles).map(
          ([path, file]) => ({
            id: file.id,
            name: path,
            contents: file.contents,
            prototype_id: file.prototype_id || prototypeId,
            created_at: file.created_at,
            updated_at: new Date().toISOString(),
          }),
        );

        // Use Supabase upsert to insert new files or update existing ones
        const { error } = await supabase
          .from("prototype_files")
          .upsert(filesToUpsert, {
            onConflict: "name,prototype_id",
            ignoreDuplicates: false,
          })
          .select();

        if (error) {
          logger.debug("error", "Error persisting file updates to database:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          return false;
        }

        return true;
      } catch (error) {
        logger.debug("error", "Error in applyAndPersistFileUpdates:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return false;
      }
    },
    [prototypeId, applyFileUpdates, logger],
  );

  // Create a new file
  const createFile = useCallback(
    async (fileName: string, initialContent = "") => {
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
    [prototypeId, files, logger],
  );

  // Delete a file
  const deleteFile = useCallback(
    async (fileName: string) => {
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
    [prototypeId, files, selectedFile, logger],
  );

  const state: FileSystemState = {
    files,
    assets,
    selectedFile,
    isLoading,
  };

  const actions: FileSystemActions = {
    selectFile,
    updateFileContentLocally,
    getSelectedFileContent,
    loadFilesFromDatabase,
    loadAssetsFromDatabase,
    saveSingleFile,
    applyAndPersistFileUpdates,
    createFile,
    deleteFile,
  };

  return {
    state,
    ...actions,
  };
};
