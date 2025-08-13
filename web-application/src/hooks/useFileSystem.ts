import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/database.types";
import { getDefaultSnackFiles } from "@/templates/defaultApp";

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export interface FileSystemState {
  files: Record<string, PrototypeFile>;
  selectedFile: string;
  isLoading: boolean;
}

export interface FileSystemActions {
  // File selection and content management
  selectFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;

  // Database operations
  loadFilesFromDatabase: (prototypeId: string) => Promise<void>;
  resetToDefault: (prototypeId: string) => Promise<void>;

  // Bulk file operations
  setFiles: (files: Record<string, PrototypeFile>) => void;
  applyFileUpdates: (
    updatedFiles: Record<string, PrototypeFile>,
  ) => void;

  // File management operations
  createFile: (fileName: string, initialContent?: string) => Promise<void>;
  deleteFile: (fileName: string) => Promise<void>;

  // Utilities
  getFileContent: (filePath: string) => string;
  getSelectedFileContent: () => string;
}

export interface UseFileSystemReturn extends FileSystemActions {
  state: FileSystemState;
}

export const useFileSystem = (
  prototypeId: string | undefined,
  defaultFile = "App.js",
): UseFileSystemReturn => {
  const [files, setFiles] = useState<Record<string, PrototypeFile>>({});
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

        console.log("Fetched prototype files:", filesDict);
      } catch (error) {
        console.error("Error loading files:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [defaultFile, selectedFile],
  );

  useEffect(() => {
    if (!prototypeId) return;
    loadFilesFromDatabase(prototypeId);
  }, [prototypeId, loadFilesFromDatabase]);

  // File selection
  const selectFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
  }, []);

  // Update file content in local state
  const updateFileContent = useCallback((filePath: string, content: string) => {
    setFiles((prevFiles) => ({
      ...prevFiles,
      [filePath]: {
        ...prevFiles[filePath],
        contents: content,
        updated_at: new Date().toISOString(),
      },
    }));
  }, []);


  // Reset to default files
  const resetToDefault = useCallback(
    async (prototypeId: string) => {
      if (!prototypeId) {
        console.error("Reset failed: no prototype ID");
        return;
      }

      try {
        setIsLoading(true);

        // Get default app files
        const defaultSnackFiles = getDefaultSnackFiles();

        // Convert SnackFiles to PrototypeFile format
        const defaultPrototypeFiles: Record<string, PrototypeFile> = {};

        for (const [fileName, fileData] of Object.entries(defaultSnackFiles)) {
          defaultPrototypeFiles[fileName] = {
            id: "", // Will be set by database
            prototype_id: prototypeId,
            name: fileName,
            contents: fileData.contents,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }

        // Delete all existing files for this prototype
        const { error: deleteError } = await supabase
          .from("prototype_files")
          .delete()
          .eq("prototype_id", prototypeId);

        if (deleteError) {
          console.error("Error deleting existing files:", deleteError);
          return;
        }

        // Insert new default files
        const filesToInsert = Object.values(defaultPrototypeFiles).map(
          (file) => ({
            prototype_id: file.prototype_id,
            name: file.name,
            contents: file.contents,
          }),
        );

        const { data: newFiles, error: insertError } = await supabase
          .from("prototype_files")
          .insert(filesToInsert)
          .select();

        if (insertError) {
          console.error("Error inserting default files:", insertError);
          return;
        }

        // Update local state with new files
        const newFilesDict = (newFiles || []).reduce(
          (acc, file) => {
            acc[file.name] = file;
            return acc;
          },
          {} as Record<string, PrototypeFile>,
        );

        setFiles(newFilesDict);
        setSelectedFile(defaultFile);

        console.log("Successfully reset to default app");
      } catch (error) {
        console.error("Error resetting to default:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [defaultFile],
  );

  // Bulk set files (with deep copy to ensure React detects changes)
  const handleSetFiles = useCallback(
    (newFiles: Record<string, PrototypeFile>) => {
      setFiles(JSON.parse(JSON.stringify(newFiles)));
    },
    [],
  );

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

  // Get content of specific file
  const getFileContent = useCallback(
    (filePath: string): string => {
      return files[filePath]?.contents || "";
    },
    [files],
  );

  // Get content of currently selected file
  const getSelectedFileContent = useCallback((): string => {
    return files[selectedFile]?.contents || "";
  }, [files, selectedFile]);

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
    selectedFile,
    isLoading,
  };

  const actions: FileSystemActions = {
    selectFile,
    updateFileContent,
    loadFilesFromDatabase,
    resetToDefault,
    setFiles: handleSetFiles,
    applyFileUpdates,
    createFile,
    deleteFile,
    getFileContent,
    getSelectedFileContent,
  };

  return {
    state,
    ...actions,
  };
};
