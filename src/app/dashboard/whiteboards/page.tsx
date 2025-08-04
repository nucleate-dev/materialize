"use client";

import { supabase } from "@/ClientConstants";
import EmptyState from "@/components/dashboard/EmptyState";
import NewWhiteboardModal from "@/components/dashboard/NewWhiteboardModal";
import CanvasThumbnail from "@/components/dashboard/ProjectThumbnail";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/hooks/useUser";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
    [setLoading, setCanvases],
  );

  useEffect(() => {
    if (user) {
      fetchCanvases(user.id);
    }
  }, [user, fetchCanvases]);

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
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl md:text-title-xl2 font-bold text-black dark:text-white mb-2">
                Whiteboards
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-body dark:text-bodydark">
                Your infinite canvases for rapid prototyping and design
              </CardDescription>
            </div>

            {/* New Canvas Button */}
            <div className="flex-shrink-0">
              <Button onClick={handleOpenModal} size="lg" className="w-full sm:w-auto gap-2">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">New Whiteboard</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Modal for new canvas */}
      <NewWhiteboardModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleCanvasCreated}
      />

      {/* Canvases Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {canvases.length > 0 ? (
            canvases.map((canvas) => (
              <CanvasThumbnail
                key={canvas.id}
                canvasName={canvas.name}
                thumbnailUrl={canvas.thumbnail_url}
                lastModified={formatRelativeTime(
                  canvas.updated_at || canvas.created_at,
                )}
                onClick={() => handleCanvasClick(canvas.id)}
              />
            ))
          ) : (
            <EmptyState type="whiteboards" onButtonClick={handleOpenModal} />
          )}
        </div>
      )}
    </div>
  );
}
