"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import EmptyState from "@/components/dashboard/EmptyState";
import NewWhiteboardModal from "@/components/dashboard/NewWhiteboardModal";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { useUser } from "@/hooks/useUser";

type Canvas = Database["public"]["Tables"]["canvases"]["Row"];
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

export default function ProjectWhiteboardsPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.project_id as string;
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch project details and canvases in parallel
      const [projectResult, canvasesResult] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase
          .from("canvases")
          .select("*")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false }),
      ]);

      if (projectResult.error) {
        console.error("Error fetching project:", projectResult.error);
      } else {
        setProject(projectResult.data);
      }

      if (canvasesResult.error) {
        console.error("Error fetching canvases:", canvasesResult.error);
      } else {
        setCanvases(canvasesResult.data || []);
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

  const handleCanvasClick = (canvasId: string) => {
    router.push(`/canvas/${canvasId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handleCanvasCreated = () => {
    fetchData(); // Refetch data after creation
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
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black dark:text-white mb-4">
            Whiteboards for {project?.name || "Project"}
          </h1>
          <p className="text-body dark:text-bodydark">
            Manage and organize whiteboards within this project
          </p>
        </div>

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
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-white mb-4">
              Whiteboards for {project?.name || "Project"}
            </h1>
            <p className="text-body dark:text-bodydark">
              Manage and organize whiteboards within this project
            </p>
          </div>

          {/* New Whiteboard Button */}
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
            New Whiteboard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {canvases.map((canvas) => (
          <ProjectThumbnail
            key={canvas.id}
            canvasName={canvas.name}
            thumbnailUrl={canvas.thumbnail_url}
            lastModified={formatRelativeTime(
              canvas.updated_at || canvas.created_at,
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
