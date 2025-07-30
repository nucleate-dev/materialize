"use client";

import { supabase } from "@/GlobalConstants";
import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  XMarkIcon,
  SparklesIcon,
  RocketLaunchIcon,
  ChevronDownIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";

interface NewPrototypeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (prototypeId: string) => void;
  projectId?: string;
}

export default function NewPrototypeModal({
  open,
  onClose,
  user,
  onCreated,
  projectId,
}: NewPrototypeModalProps) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Fetch user's projects
  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;

      setIsLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          console.error("Error fetching projects:", error);
          return;
        }
        console.log("Fetched projects:", data);
        setProjects(data || []);
      } catch (error) {
        console.error("Error fetching projects:", error);
      } finally {
        setIsLoadingProjects(false);
      }
    }
    if (open && user?.id) {
      fetchProjects();
    }
  }, [open, user, setIsLoadingProjects, setProjects]);

  // Set initial project selection
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project);
      }
    }
  }, [projectId, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from("prototypes")
        .insert({
          name: name.trim(),
          owner_id: user.id,
          project_id: selectedProject?.id || null,
          description: null,
          prototype_context: null,
          thumbnail_url: null,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating prototype:", error);
        throw error;
      }

      const { error: prototypeFilesInsertError } = await supabase
        .from("prototype_files")
        .insert(getDefaultPrototypeFiles(data.id));
      if (prototypeFilesInsertError) {
        console.error(
          "Error creating default prototype files:",
          prototypeFilesInsertError,
        );
        throw error;
      }

      // Reset form
      setName("");
      setSelectedProject(null);
      setTouched(false);
      onCreated(data.id);
      onClose();
    } catch (error) {
      console.error("Error creating prototype:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl transition-all duration-300">
      {/* Glassmorphism Modal Container */}
      <div className="relative bg-white/95 dark:bg-boxdark/95 backdrop-blur-xl rounded-3xl shadow-2xl dark:shadow-black/20 border border-white/20 dark:border-strokedark/30 p-8 w-full max-w-lg mx-4 animate-fadeInUp">
        {/* Inner glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-primary/5 dark:from-white/5 dark:to-primary/10 rounded-3xl pointer-events-none"></div>

        {/* Animated Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-20 h-20 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-full blur-2xl animate-pulse"></div>
          <div className="absolute -bottom-10 -left-10 w-16 h-16 bg-gradient-to-tr from-meta-5/10 to-meta-3/10 dark:from-meta-5/20 dark:to-meta-3/20 rounded-full blur-xl animate-pulse delay-1000"></div>
        </div>

        {/* Close Button */}
        <button
          className="absolute top-6 right-6 p-2 rounded-xl bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110 z-50"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          <XMarkIcon className="w-5 h-5 text-body dark:text-bodydark hover:text-red-500 dark:hover:text-red-400 transition-colors duration-300" />
        </button>

        {/* Header Section */}
        <div className="relative z-10 text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10 rounded-full blur-2xl animate-pulse"></div>
              <div className="relative p-4 bg-gradient-to-br from-primary to-secondary dark:from-primary dark:to-secondary rounded-2xl shadow-2xl shadow-primary/25 dark:shadow-primary/40 ring-1 ring-white/20 dark:ring-primary/30">
                <SparklesIcon className="w-8 h-8 text-white drop-shadow-lg" />
              </div>
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-3 text-black dark:text-white">
            Create New Prototype
          </h2>
          <p className="text-body dark:text-bodydark leading-relaxed">
            Transform your ideas into reality with AI-powered development ✨
          </p>
        </div>
        {/* Form Section */}
        <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-black dark:text-white mb-3">
              Prototype Name <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              {/* Enhanced Input Container */}
              <div className="relative overflow-hidden rounded-2xl">
                {/* Animated border gradient */}
                <div
                  className={`absolute inset-0 rounded-2xl transition-opacity duration-500 blur-sm ${
                    touched && !name.trim()
                      ? "bg-gradient-to-r from-red-500/30 to-red-600/30 opacity-100"
                      : "bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/30 dark:via-secondary/30 dark:to-meta-5/30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  }`}
                ></div>
                <div className="absolute inset-[1px] bg-white/90 dark:bg-boxdark/90 rounded-2xl"></div>

                <input
                  type="text"
                  className="relative w-full px-6 py-4 text-lg font-medium bg-transparent text-black dark:text-white placeholder-body/60 dark:placeholder-bodydark/60 border-0 focus:outline-none focus:ring-0 transition-all duration-300"
                  placeholder="e.g. E-commerce Mobile App ✨"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  maxLength={64}
                />
              </div>
              {touched && !name.trim() && (
                <div className="mt-3 flex items-center gap-2 text-red-500 text-sm font-medium">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span>Prototype name is required</span>
                </div>
              )}
            </div>
          </div>

          {/* Project Dropdown */}
          <div>
            <label className="block text-sm font-semibold text-black dark:text-white mb-3">
              Project
            </label>
            <Listbox value={selectedProject} onChange={setSelectedProject}>
              <div className="relative group">
                {/* Enhanced Dropdown Container */}
                <div className="relative overflow-hidden rounded-2xl">
                  {/* Animated border gradient */}
                  <div className="absolute inset-0 rounded-2xl transition-opacity duration-500 blur-sm bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/30 dark:via-secondary/30 dark:to-meta-5/30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"></div>
                  <div className="absolute inset-[1px] bg-white/90 dark:bg-boxdark/90 rounded-2xl"></div>

                  <ListboxButton className="relative w-full px-6 py-4 text-lg font-medium bg-transparent text-left border-0 focus:outline-none focus:ring-0 transition-all duration-300 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FolderIcon className="w-5 h-5 text-primary dark:text-primary" />
                      <span
                        className={
                          selectedProject
                            ? "text-black dark:text-white"
                            : "text-body/60 dark:text-bodydark/60"
                        }
                      >
                        {selectedProject?.name || "No project selected"}
                      </span>
                    </div>
                    <ChevronDownIcon className="w-5 h-5 text-body dark:text-bodydark transition-transform duration-300 ui-open:rotate-180" />
                  </ListboxButton>

                  <ListboxOptions
                    anchor="bottom start"
                    className="mt-2 z-[9999] bg-white/95 dark:bg-boxdark/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-strokedark/30 overflow-hidden transition duration-200 ease-out [--anchor-gap:8px] min-w-[var(--button-width)]"
                  >
                    <div className="py-2">
                      {/* No Project Option */}
                      <ListboxOption
                        value={null}
                        className="w-full px-6 py-3 text-left hover:bg-white/50 dark:hover:bg-boxdark/50 transition-colors duration-200 flex items-center gap-3 cursor-pointer ui-active:bg-white/50 ui-active:dark:bg-boxdark/50"
                      >
                        <div className="w-5 h-5 rounded border-2 border-stroke dark:border-strokedark flex items-center justify-center">
                          <div className="w-2 h-2 bg-primary rounded-full ui-not-selected:hidden"></div>
                        </div>
                        <span className="text-body dark:text-bodydark font-medium">
                          No project
                        </span>
                      </ListboxOption>

                      {/* Loading State */}
                      {isLoadingProjects && (
                        <div className="px-6 py-3 flex items-center gap-3">
                          <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                          <span className="text-body dark:text-bodydark">
                            Loading projects...
                          </span>
                        </div>
                      )}

                      {/* Project Options */}
                      {!isLoadingProjects &&
                        projects.map((project) => (
                          <ListboxOption
                            key={project.id}
                            value={project}
                            className="w-full px-6 py-3 text-left hover:bg-white/50 dark:hover:bg-boxdark/50 transition-colors duration-200 flex items-center gap-3 cursor-pointer ui-active:bg-white/50 ui-active:dark:bg-boxdark/50"
                          >
                            <div className="w-5 h-5 rounded border-2 border-stroke dark:border-strokedark flex items-center justify-center">
                              <div className="w-2 h-2 bg-primary rounded-full ui-not-selected:hidden"></div>
                            </div>
                            <FolderIcon className="w-4 h-4 text-primary dark:text-primary" />
                            <span className="text-black dark:text-white font-medium">
                              {project.name}
                            </span>
                          </ListboxOption>
                        ))}

                      {/* Empty State */}
                      {!isLoadingProjects && projects.length === 0 && (
                        <div className="px-6 py-3 text-center">
                          <span className="text-body dark:text-bodydark text-sm">
                            No projects found
                          </span>
                        </div>
                      )}
                    </div>
                  </ListboxOptions>
                </div>
              </div>
            </Listbox>
          </div>

          {/* Create Button */}
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className={`relative group w-full p-4 rounded-2xl transition-all duration-500 transform-gpu ${
              name.trim() && !isCreating
                ? "bg-gradient-to-r from-primary via-secondary to-meta-5 hover:from-primary/90 hover:via-secondary/90 hover:to-meta-5/90 text-white shadow-2xl shadow-primary/40 hover:shadow-primary/60 dark:shadow-primary/60 dark:hover:shadow-primary/80 scale-100 hover:scale-105 ring-2 ring-white/30 dark:ring-primary/30 hover:ring-white/50 dark:hover:ring-primary/50"
                : "bg-stroke/50 dark:bg-strokedark/50 text-body/40 dark:text-bodydark/40 cursor-not-allowed scale-95"
            }`}
          >
            {/* Button glow effect */}
            {name.trim() && !isCreating && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/30 to-secondary/30 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            )}

            <div className="relative flex items-center justify-center gap-3">
              {isCreating ? (
                <>
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="font-bold text-lg">Creating Magic...</span>
                </>
              ) : (
                <>
                  <RocketLaunchIcon className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  <span className="font-bold text-lg">Launch Prototype</span>
                </>
              )}
            </div>
          </button>
        </form>
      </div>
      <style jsx>{`
        .animate-fadeInUp {
          animation: fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(60px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
