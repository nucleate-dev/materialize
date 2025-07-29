"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import EmptyState from "@/components/dashboard/EmptyState";
import { supabase } from "@/GlobalConstants";

// Union type for recent items
type RecentItem = {
  id: string;
  name: string;
  thumbnail_url: string | null;
  updated_at: string | null;
  created_at: string | null;
  type: "prototype" | "canvas";
};

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

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.project_id as string;
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecentItems = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch prototypes and canvases in parallel
      const [prototypesResult, canvasesResult] = await Promise.all([
        supabase
          .from("prototypes")
          .select("*")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("canvases")
          .select("*")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false }),
      ]);

      if (prototypesResult.error) {
        console.error("Error fetching prototypes:", prototypesResult.error);
      }

      if (canvasesResult.error) {
        console.error("Error fetching canvases:", canvasesResult.error);
      }

      // Transform data to unified format
      const prototypes: RecentItem[] = (prototypesResult.data || []).map(
        (p) => ({
          id: p.id,
          name: p.name,
          thumbnail_url: p.thumbnail_url,
          updated_at: p.updated_at,
          created_at: p.created_at,
          type: "prototype" as const,
        }),
      );

      const canvases: RecentItem[] = (canvasesResult.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        thumbnail_url: c.thumbnail_url,
        updated_at: c.updated_at,
        created_at: c.created_at,
        type: "canvas" as const,
      }));

      // Merge two sorted arrays efficiently (O(n) time)
      const allItems: RecentItem[] = [];
      let i = 0, j = 0;
      
      // Helper function to get comparable date
      const getDate = (item: RecentItem) => new Date(item.updated_at || item.created_at || 0).getTime();
      
      // Merge the two sorted arrays
      while (i < prototypes.length && j < canvases.length) {
        if (getDate(prototypes[i]) >= getDate(canvases[j])) {
          allItems.push(prototypes[i]);
          i++;
        } else {
          allItems.push(canvases[j]);
          j++;
        }
      }
      
      // Add remaining items
      while (i < prototypes.length) {
        allItems.push(prototypes[i]);
        i++;
      }
      
      while (j < canvases.length) {
        allItems.push(canvases[j]);
        j++;
      }

      setRecentItems(allItems);
    } catch (error) {
      console.error("Error fetching recent items:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRecentItems();
  }, [fetchRecentItems]);

  const handleItemClick = (item: RecentItem) => {
    if (item.type === "prototype") {
      router.push(`/dashboard/projects/${projectId}/prototypes/${item.id}`);
    } else {
      router.push(`/dashboard/projects/${projectId}/whiteboards/${item.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-title-xl2 font-bold text-black dark:text-white mb-2">
          Recent Activity
        </h1>
        <p className="text-body dark:text-bodydark">
          Your most recently updated prototypes and whiteboards
        </p>
      </div>

      {/* Recent Items Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recentItems.length > 0 ? (
            recentItems.map((item) => (
              <ProjectThumbnail
                key={`${item.type}-${item.id}`}
                prototypeName={
                  item.type === "prototype" ? item.name : undefined
                }
                canvasName={item.type === "canvas" ? item.name : undefined}
                thumbnailUrl={item.thumbnail_url}
                lastModified={formatRelativeTime(
                  item.updated_at || item.created_at,
                )}
                onClick={() => handleItemClick(item)}
              />
            ))
          ) : (
            <div className="col-span-full">
              <EmptyState
                type="prototypes"
                title="No recent activity"
                description="Create your first prototype or whiteboard to get started"
                onButtonClick={() =>
                  router.push(`/dashboard/projects/${projectId}/prototypes`)
                }
                buttonText="Create Prototype"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
