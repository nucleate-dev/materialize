"use client";

import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Project = Database["public"]["Tables"]["projects"]["Row"];

function NewProjectModal({
  open,
  onClose,
  user,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: name.trim(),
          creator_id: user.id,
          owner_id: user.id,
          description: null,
          project_context: null,
          thumbnail_url: null,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating project:", error);
        throw error;
      }

      // Reset form
      setName("");
      setTouched(false);
      onCreated(data.id);
      onClose();
    } catch (error) {
      console.error("Error creating project:", error);
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
          Create New Project
        </h2>
        <p className="mb-6 text-gray-500 dark:text-gray-300 text-center">
          Give your project a name to get started.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${touched && !name.trim() ? "border-red-500 ring-red-200" : ""}`}
              placeholder="e.g. Website Redesign"
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
            {isCreating ? "Creating..." : "Create Project"}
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

export default function ProjectsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .or(`creator_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching projects:", error);
        return;
      }

      setProjects(data || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user?.id]);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handleProjectCreated = (projectId: string) => {
    fetchProjects(); // Refetch projects after creation
    router.push(`/dashboard/projects/${projectId}`);
  };

  return (
    <div className="mx-auto max-w-screen-2xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl2 font-bold text-black dark:text-white mb-2">
              All projects
            </h1>
            <p className="text-body dark:text-bodydark">
              Manage and organize your projects
            </p>
          </div>

          {/* New Project Button */}
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
            New Project
          </button>
        </div>
      </div>

      {/* Modal for new project */}
      <NewProjectModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handleProjectCreated}
      />

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {projects.length > 0 ? (
            projects.map((project) => (
              <ProjectThumbnail
                key={project.id}
                projectName={project.name}
                thumbnailUrl={project.thumbnail_url}
                lastModified={
                  project.updated_at
                    ? new Date(project.updated_at).toLocaleDateString()
                    : new Date(project.created_at!).toLocaleDateString()
                }
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
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
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
                No projects yet
              </h3>
              <p className="text-body dark:text-bodydark mb-6 max-w-md">
                Create your first project to start prototyping your ideas at the
                speed of thought.
              </p>
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200"
              >
                Create First Project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
