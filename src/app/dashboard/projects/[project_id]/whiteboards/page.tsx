"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import EmptyState from "@/components/dashboard/EmptyState";
import NewWhiteboardModal from "@/components/dashboard/NewWhiteboardModal";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";

type Canvas = Database["public"]["Tables"]["canvases"]["Row"];

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

export default function ProjectWhiteboardsPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.project_id as string;
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchCanvases = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("canvases")
        .select("*")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching canvases:", error);
        return;
      }

      setCanvases(data || []);
    } catch (error) {
      console.error("Error fetching canvases:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const handleCanvasClick = (canvasId: string) => {
    router.push(`/canvas/${canvasId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handleCanvasCreated = () => {
    fetchCanvases(); // Refetch canvases after creation
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (canvases.length === 0) {
    return (
      <>
        <EmptyState
          type="whiteboards"
          title="This project has no whiteboards"
          description="Create your first infinite canvas within this project to start prototyping and designing at the speed of thought."
          buttonText="Create Whiteboard in Project"
          onButtonClick={handleOpenModal}
        />
        
        {/* Modal for new whiteboard */}
        <NewWhiteboardModal
          open={modalOpen}
          onClose={handleCloseModal}
          user={user}
          onCreated={handleCanvasCreated}
          projectId={projectId}
        />
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {canvases.map((canvas) => (
          <ProjectThumbnail
            key={canvas.id}
            canvasName={canvas.name}
            thumbnailUrl={canvas.thumbnail_url}
            lastModified={formatRelativeTime(
              canvas.updated_at || canvas.created_at
            )}
            onClick={() => handleCanvasClick(canvas.id)}
          />
        ))}
      </div>

      {/* Modal for new whiteboard */}
      <NewWhiteboardModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleCanvasCreated}
        projectId={projectId}
      />
    </>
  );
}