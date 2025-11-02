"use client";

import { supabase } from "@/ClientConstants";
import EmptyState from "@/components/dashboard/EmptyState";
import NewPrototypeModal from "@/components/dashboard/NewPrototypeModal";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import PrototypeThumbnail from "@/components/dashboard/PrototypeThumbnail";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type Folder = Database["public"]["Tables"]["projects"]["Row"];

// Utility to format date as relative time
function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // seconds
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return date.toLocaleDateString();
}

export default function FolderPrototypesPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const logger = useProductLogger();
  const folderId = params?.project_id as string;
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePrototype, setActivePrototype] = useState<Prototype | null>(
    null,
  );

  const fetchData = useCallback(async () => {
    if (!folderId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch project details and prototypes in parallel
      const [folderResult, prototypesResult] = await Promise.all([
        supabase.from("projects").select("*").eq("id", folderId).single(),
        supabase
          .from("prototypes")
          .select("*")
          .eq("project_id", folderId)
          .order("updated_at", { ascending: false }),
      ]);

      if (folderResult.error) {
        logger.debug("error", "Error fetching folder:", {
          ...folderResult.error,
        });
      } else {
        setFolder(folderResult.data);
      }

      if (prototypesResult.error) {
        logger.debug("error", "Error fetching prototypes:", {
          ...prototypesResult.error,
        });
      } else {
        setPrototypes(prototypesResult.data || []);
      }
    } catch (error) {
      logger.debug("error", "Error fetching data:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsLoading(false);
    }
  }, [folderId, logger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrototypeView = (prototypeId: string) => {
    router.push(`/prototype/${prototypeId}`);
  };

  const handlePrototypeEdit = (prototypeId: string) => {
    router.push(`/dashboard/projects/${prototypeId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handlePrototypeCreated = (prototypeId: string) => {
    fetchData(); // Refetch data after creation
    router.push(`/dashboard/projects/${prototypeId}`);
  };

  const handleOpenSettings = (prototype: Prototype) => {
    setActivePrototype(prototype);
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
    setActivePrototype(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (prototypes.length === 0) {
    return (
      <>
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black dark:text-white mb-4">
            Prototypes for {folder?.name || "Folder"}
          </h1>
          <p className="text-body dark:text-bodydark">
            Manage and organize prototypes within this folder
          </p>
        </div>

        <EmptyState
          type="prototypes"
          title="This folder has no prototypes"
          description="Create your first prototype within this folder to start building amazing experiences."
          buttonText="Create Prototype in Folder"
          onButtonClick={handleOpenModal}
        />

        {/* Modal for new prototype */}
        <NewPrototypeModal
          open={modalOpen}
          onClose={handleCloseModal}
          user={user}
          onCreated={handlePrototypeCreated}
          projectId={folderId}
        />
      </>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-white mb-4">
              Prototypes for {folder?.name || "Folder"}
            </h1>
            <p className="text-body dark:text-bodydark">
              Manage and organize prototypes within this folder
            </p>
          </div>

          {/* New Prototype Button */}
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200"
          >
            <svg
              className="fill-current"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 4V16M4 10H16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New Prototype
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {prototypes.map((prototype) => (
          <PrototypeThumbnail
            key={prototype.id}
            prototypeName={prototype.name}
            prototypeId={prototype.id}
            thumbnailUrl={prototype.thumbnail_url}
            lastModified={formatRelativeTime(
              prototype.updated_at || prototype.created_at,
            )}
            onView={() => handlePrototypeView(prototype.id)}
            onEdit={() => handlePrototypeEdit(prototype.id)}
            onSettings={() => handleOpenSettings(prototype)}
          />
        ))}
      </div>

      {/* Modal for new prototype */}
      <NewPrototypeModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handlePrototypeCreated}
        projectId={folderId}
      />

      <PrototypeSettingsModal
        open={settingsOpen}
        onClose={handleCloseSettings}
        prototype={activePrototype}
        onUpdated={() => {
          fetchData();
          handleCloseSettings();
        }}
      />
    </>
  );
}
