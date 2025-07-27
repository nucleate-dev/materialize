"use client";

import { useCallback, useState } from "react";
import CanvasThumbnail from "@/components/dashboard/ProjectThumbnail";
import NewWhiteboardModal from "@/components/dashboard/NewWhiteboardModal";
import { supabase } from "@/GlobalConstants";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { Database } from "@/lib/types/database.types";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

export default function WhiteboardsPage() {
  // const router = useRouter();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [canvases, setCanvases] = useState<
    Database["public"]["Tables"]["canvases"]["Row"][]
  >([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Move fetchCanvases outside useEffect so it can be called after creation
  const fetchCanvases = useCallback(
    async (userId: string) => {
      setLoading(true);
      const { data, error } = await supabase
        .from("canvases")
        .select("*")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("Error fetching canvases:", error);
        setCanvases([]);
      } else {
        setCanvases(data || []);
      }
      setLoading(false);
    },
    [setLoading, setCanvases]
  );

  useEffect(() => {
    if (user) {
      fetchCanvases(user.id);
    }
  }, [user]);

  const handleCanvasClick = (canvasId: string) => {
    console.log(`Opening canvas ${canvasId}`);
    router.push(`/canvas/${canvasId}`);
  };

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  // Callback to refetch canvases after creation
  const handleCanvasCreated = () => {
    fetchCanvases(user?.id ?? "");
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl2 font-bold text-black dark:text-white mb-2">
              Whiteboards
            </h1>
            <p className="text-body dark:text-bodydark">
              Your infinite canvases for rapid prototyping and design
            </p>
          </div>

          {/* New Canvas Button */}
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

      {/* Modal for new canvas */}
      <NewWhiteboardModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleCanvasCreated}
      />

      {/* Canvases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-10 text-gray-500 dark:text-gray-300">
            Loading...
          </div>
        ) : canvases.length > 0 ? (
          canvases.map((canvas) => (
            <CanvasThumbnail
              key={canvas.id}
              canvasName={canvas.name}
              thumbnailUrl={canvas.thumbnail_url}
              lastModified={formatRelativeTime(
                canvas.updated_at || canvas.created_at
              )}
              onClick={() => handleCanvasClick(canvas.id)}
            />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 bg-gray-100 dark:bg-meta-4 rounded-full flex items-center justify-center mb-6">
              <svg
                className="w-12 h-12 text-body dark:text-bodydark2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
              No whiteboards yet
            </h3>
            <p className="text-body dark:text-bodydark mb-6 max-w-md">
              Create your first infinite canvas to start prototyping and
              designing at the speed of thought.
            </p>
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200"
            >
              Create First Whiteboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
