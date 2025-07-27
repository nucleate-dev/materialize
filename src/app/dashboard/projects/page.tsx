"use client";

import ProjectThumbnail from "@/components/dashboard/ProjectThumbnail";
import NewProjectModal from "@/components/dashboard/NewProjectModal";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export default function ProjectsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });

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
  }, [user?.id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handleProjectCreated = (projectId: string) => {
    fetchProjects(); // Refetch projects after creation
    router.push(`/dashboard/projects/${projectId}`);
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
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
