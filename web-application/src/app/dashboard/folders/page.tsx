"use client";

import { supabase } from "@/ClientConstants";
import EmptyState from "@/components/dashboard/EmptyState";
import FolderThumbnail from "@/components/dashboard/FolderThumbnail";
import NewFolderModal from "@/components/dashboard/NewFolderModal";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type FolderRow = Database["public"]["Tables"]["folders"]["Row"];

export default function FoldersPage() {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();
  const [modalOpen, setModalOpen] = useState(false);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchFolders = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        logger.debug("error", "Error fetching folders:", {
          ...error,
        });
        return;
      }

      setFolders(data || []);
    } catch (error) {
      logger.debug("error", "Error fetching folders:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, logger]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handleFolderCreated = (folderId: string) => {
    fetchFolders();
    router.push(`/dashboard/folders/${folderId}`);
  };

  // Filter folders client-side for instant feedback
  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative min-h-screen text-foreground font-sans">
      <GridBackground />

      <div className="container mx-auto px-6 py-12 max-w-7xl">

        {/* --- Header Section --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              Folders
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Organize your projects and prototypes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Bar (Visual Polish) */}
            <div className="hidden md:flex relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-muted-foreground transition-colors" />
              <input
                type="text"
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 bg-accent/50 border border-border rounded-full pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border focus:bg-accent transition-all"
              />
            </div>

            {/* Primary Action */}
            <Button
              onClick={handleOpenModal}
              className="h-9 px-4 rounded-full font-medium text-sm transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Folder
            </Button>
          </div>
        </div>

        {/* --- Content Area --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-muted-foreground/50" />
            <p className="text-sm font-medium animate-pulse">Loading your workspace...</p>
          </div>
        ) : (
          <>
            {filteredFolders.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredFolders.map((folder) => (
                  <div key={folder.id} className="group">
                    {/*
                       Note: Assuming FolderThumbnail is a separate component.
                       We wrap it here to ensure layout stability, but styling
                       of the inner card depends on that component.
                    */}
                    <FolderThumbnail
                      folderName={folder.name}
                      thumbnailUrl={folder.thumbnail_url}
                      lastModified={
                        folder.updated_at
                          ? new Date(folder.updated_at).toLocaleDateString()
                          : new Date(folder.created_at!).toLocaleDateString()
                      }
                      onClick={() => router.push(`/dashboard/folders/${folder.id}`)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-2xl bg-accent/20 py-24">
                <EmptyState
                  type="folders"
                  onButtonClick={handleOpenModal}
                // You might need to pass explicit styles to EmptyState if it doesn't adapt automatically,
                // but usually standard Tailwind classes work fine inside dark containers.
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <NewFolderModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleFolderCreated}
      />
    </div>
  );
}