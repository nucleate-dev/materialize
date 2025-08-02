"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import EmptyState from "@/components/dashboard/EmptyState";
import NewPrototypeModal from "@/components/dashboard/NewPrototypeModal";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

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

export default function ProjectPrototypesPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.project_id as string;
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePrototype, setActivePrototype] = useState<Prototype | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch project details and prototypes in parallel
      const [projectResult, prototypesResult] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase
          .from("prototypes")
          .select("*")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false }),
      ]);

      if (projectResult.error) {
        console.error("Error fetching project:", projectResult.error);
      } else {
        setProject(projectResult.data);
      }

      if (prototypesResult.error) {
        console.error("Error fetching prototypes:", prototypesResult.error);
      } else {
        setPrototypes(prototypesResult.data || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrototypeClick = (prototypeId: string) => {
    router.push(`/dashboard/prototypes/${prototypeId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handlePrototypeCreated = (prototypeId: string) => {
    fetchData(); // Refetch data after creation
    router.push(`/dashboard/prototypes/${prototypeId}`);
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
            Prototypes for {project?.name || "Project"}
          </h1>
          <p className="text-body dark:text-bodydark">
            Manage and organize prototypes within this project
          </p>
        </div>

        <EmptyState
          type="prototypes"
          title="This project has no prototypes"
          description="Create your first prototype within this project to start building amazing experiences."
          buttonText="Create Prototype in Project"
          onButtonClick={handleOpenModal}
        />

        {/* Modal for new prototype */}
        <NewPrototypeModal
          open={modalOpen}
          onClose={handleCloseModal}
          user={user}
          onCreated={handlePrototypeCreated}
          projectId={projectId}
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
              Prototypes for {project?.name || "Project"}
            </h1>
            <p className="text-body dark:text-bodydark">
              Manage and organize prototypes within this project
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
          <ProjectThumbnail
            key={prototype.id}
            prototypeName={prototype.name}
            thumbnailUrl={prototype.thumbnail_url}
            lastModified={formatRelativeTime(
              prototype.updated_at || prototype.created_at,
            )}
            onClick={() => handlePrototypeClick(prototype.id)}
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
        projectId={projectId}
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
