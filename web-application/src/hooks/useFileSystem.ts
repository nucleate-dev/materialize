import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/database.types";
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

  // Bulk file operations
  setFiles: (files: Record<string, PrototypeFile>) => void;
  setAssets: (assets: Record<string, PrototypeAsset>) => void;
  applyFileUpdates: (updatedFiles: Record<string, PrototypeFile>) => void;

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
          console.error("Error fetching prototype files:", error);
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
        console.error("Error loading files:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [defaultFile, selectedFile],
  );

  const loadAssetsFromDatabase = useCallback(async (prototypeId: string) => {
    if (!prototypeId) return;

    try {
      const { data, error } = await supabase
        .from("prototype_assets")
        .select("*")
        .eq("prototype_id", prototypeId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching prototype assets:", error);
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

      console.log("Fetched assets:", data);
    } catch (error) {
      console.error("Error loading assets:", error);
    }
  }, []);

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

  // Bulk set files (with deep copy to ensure React detects changes)
  const handleSetFiles = useCallback(
    (newFiles: Record<string, PrototypeFile>) => {
      setFiles(JSON.parse(JSON.stringify(newFiles)));
    },
    [],
  );

  // Bulk set assets (with deep copy to ensure React detects changes)
  const handleSetAssets = useCallback(
    (newAssets: Record<string, PrototypeAsset>) => {
      setAssets(JSON.parse(JSON.stringify(newAssets)));
    },
    [],
  );

  const getSelectedFileContent = useCallback((): string => {
    return files[selectedFile]?.contents || "";
  }, [files, selectedFile]);

  // Apply file updates from external sources (like chat API responses)
  const applyFileUpdates = useCallback(
    (updatedFiles: Record<string, PrototypeFile>) => {
      // Update local state only - database persistence handled by server
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

  // Create a new file
  const createFile = useCallback(
    async (fileName: string, initialContent = "") => {
      if (!prototypeId) {
        console.error("Create file failed: no prototype ID");
        return;
      }

      if (files[fileName]) {
        console.error("File already exists:", fileName);
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
          console.error(`Error creating file ${fileName}:`, error);
          return;
        }

        // Update local state
        setFiles((prevFiles) => ({
          ...prevFiles,
          [fileName]: newFile,
        }));

        // Select the new file
        setSelectedFile(fileName);

        console.log("Successfully created file:", fileName);
      } catch (error) {
        console.error(`Error creating file ${fileName}:`, error);
      }
    },
    [prototypeId, files],
  );

  // Delete a file
  const deleteFile = useCallback(
    async (fileName: string) => {
      if (!prototypeId) {
        console.error("Delete file failed: no prototype ID");
        return;
      }

      const fileToDelete = files[fileName];
      if (!fileToDelete) {
        console.error("File not found:", fileName);
        return;
      }

      // Prevent deleting the last file
      if (Object.keys(files).length <= 1) {
        console.error("Cannot delete the last file");
        return;
      }

      try {
        // Delete file from database
        const { error } = await supabase
          .from("prototype_files")
          .delete()
          .eq("id", fileToDelete.id);

        if (error) {
          console.error(`Error deleting file ${fileName}:`, error);
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

        console.log("Successfully deleted file:", fileName);
      } catch (error) {
        console.error(`Error deleting file ${fileName}:`, error);
      }
    },
    [prototypeId, files, selectedFile],
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
    setFiles: handleSetFiles,
    setAssets: handleSetAssets,
    applyFileUpdates,
    createFile,
    deleteFile,
  };

  return {
    state,
    ...actions,
  };
};
