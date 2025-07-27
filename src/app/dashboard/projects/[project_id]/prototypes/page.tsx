"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import EmptyState from "@/components/dashboard/EmptyState";
import NewPrototypeModal from "@/components/dashboard/NewPrototypeModal";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

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
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchPrototypes = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching prototypes:", error);
        return;
      }

      setPrototypes(data || []);
    } catch (error) {
      console.error("Error fetching prototypes:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPrototypes();
  }, [fetchPrototypes]);

  const handlePrototypeClick = (prototypeId: string) => {
    router.push(`/dashboard/prototypes/${prototypeId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handlePrototypeCreated = (prototypeId: string) => {
    fetchPrototypes(); // Refetch prototypes after creation
    router.push(`/dashboard/prototypes/${prototypeId}`);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {prototypes.map((prototype) => (
          <ProjectThumbnail
            key={prototype.id}
            prototypeName={prototype.name}
            thumbnailUrl={prototype.thumbnail_url}
            lastModified={formatRelativeTime(
              prototype.updated_at || prototype.created_at
            )}
            onClick={() => handlePrototypeClick(prototype.id)}
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
    </>
  );
}