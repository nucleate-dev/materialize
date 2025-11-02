"use client";

import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { useCallback, useEffect, useState } from "react";

type Folder = Database["public"]["Tables"]["folders"]["Row"];

export function useFolder(folderId: string | undefined) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFolder = useCallback(async () => {
    if (!folderId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("id", folderId)
        .single();

      if (error) {
        setError(error.message);
        setFolder(null);
      } else {
        setFolder(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setFolder(null);
    } finally {
      setIsLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchFolder();
  }, [fetchFolder]);

  return {
    folder,
    isLoading,
    error,
    refetch: fetchFolder,
  };
}
