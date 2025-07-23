"use client";

import { useState } from "react";
// import { useRouter } from "next/navigation";
import CanvasThumbnail from "../components/ProjectThumbnail";
import { supabase } from "@/GlobalConstants";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { User } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";
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

function NewProjectModal({
  open,
  onClose,
  user,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);
    try {
      const { data: canvas, error } = await supabase
        .from("canvases")
        .insert({
          owner_id: user.id,
          name,
          description,
          thumbnail_url:
            "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop&crop=center",
        })
        .select()
        .single();
      if (error) {
        console.error("Error creating canvas:", error);
        // TODO: Show error toast/notification
        return;
      }
      if (canvas) {
        onCreated();
        onClose();
      }
    } catch (error) {
      console.error("Error creating canvas:", error);
      // TODO: Show error toast/notification
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md relative animate-fadeInUp">
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white text-center">
          Create New Canvas
        </h2>
        <p className="mb-6 text-gray-500 dark:text-gray-300 text-center">
          Give your canvas a name and description to get started.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Canvas Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white ${touched && !name.trim() ? "border-red-500 ring-red-200" : ""}`}
              placeholder="e.g. Marketing Plan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={64}
            />
            {touched && !name.trim() && (
              <span className="text-xs text-red-500 mt-1 block">
                Name is required.
              </span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Description
            </label>
            <textarea
              className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white resize-none min-h-[60px]"
              placeholder="Describe your canvas (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
            />
          </div>
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-lg flex items-center justify-center gap-2"
          >
            {isCreating && (
              <svg
                className="animate-spin h-5 w-5 mr-2 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isCreating ? "Creating..." : "Create Canvas"}
          </button>
        </form>
      </div>
      <style jsx>{`
        .animate-fadeInUp {
          animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default function Projects() {
  // const router = useRouter();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [canvases, setCanvases] = useState<
    Database["public"]["Tables"]["canvases"]["Row"][]
  >([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Move fetchCanvases outside useEffect so it can be called after creation
  const fetchCanvases = async (userId: string) => {
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
  };

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
    <div className="mx-auto max-w-screen-2xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl2 font-bold text-black dark:text-white mb-2">
              Canvases
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
            New Canvas
          </button>
        </div>
      </div>

      {/* Modal for new canvas */}
      <NewProjectModal
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
              No canvases yet
            </h3>
            <p className="text-body dark:text-bodydark mb-6 max-w-md">
              Create your first infinite canvas to start prototyping and
              designing at the speed of thought.
            </p>
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200"
            >
              Create First Canvas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
