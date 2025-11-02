"use client";

import { supabase } from "@/ClientConstants";
import EmptyState from "@/components/dashboard/EmptyState";
import FolderThumbnail from "@/components/dashboard/FolderThumbnail";
import NewFolderModal from "@/components/dashboard/NewFolderModal";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Folder = Database["public"]["Tables"]["projects"]["Row"];

export default function FoldersPage() {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();
  const [modalOpen, setModalOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFolders = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
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
    fetchFolders(); // Refetch folders after creation
    router.push(`/dashboard/folders/${folderId}`);
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {/* Page Header */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-title-xl2 font-bold text-black dark:text-white mb-2">
                All Folders
              </h1>
              <p className="text-sm sm:text-base text-body dark:text-bodydark">
                Create and manage your folders, which hold your projects.
              </p>
            </div>

            {/* New Project Button */}
            <div className="flex-shrink-0">
              <Button
                onClick={handleOpenModal}
                size="lg"
                className="w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                <span className="hidden sm:inline">New Folder</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Modal for new project */}
      <NewFolderModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleFolderCreated}
      />

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {folders.length > 0 ? (
            folders.map((project) => (
              <FolderThumbnail
                key={project.id}
                folderName={project.name}
                thumbnailUrl={project.thumbnail_url}
                lastModified={
                  project.updated_at
                    ? new Date(project.updated_at).toLocaleDateString()
                    : new Date(project.created_at!).toLocaleDateString()
                }
                onClick={() => router.push(`/dashboard/folders/${project.id}`)}
              />
            ))
          ) : (
            <EmptyState type="projects" onButtonClick={handleOpenModal} />
          )}
        </div>
      )}
    </div>
  );
}
