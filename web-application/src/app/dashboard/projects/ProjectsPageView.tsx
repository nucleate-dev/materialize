"use client";

import EmptyState from "@/components/dashboard/EmptyState";
import NewPrototypeModal from "@/components/dashboard/NewPrototypeModal";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import PrototypeThumbnail from "@/components/dashboard/PrototypeThumbnail";
import PrototypeThumbnailSkeleton from "@/components/dashboard/PrototypeThumbnailSkeleton";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { User } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { Prototype } from "./types";

type ProjectsPageViewProps = {
  prototypes: Prototype[];
  isLoading: boolean;
  modalOpen: boolean;
  settingsOpen: boolean;
  activePrototype: Prototype | null;
  user: User | null;
  onOpenModal: () => void;
  onCloseModal: () => void;
  onPrototypeCreated: (id: string) => void;
  onViewPrototype: (id: string) => void;
  onEditPrototype: (id: string) => void;
  onOpenSettings: (prototype: Prototype) => void;
  onCloseSettings: () => void;
  onPrototypeUpdated: (prototype: Prototype) => void;
  onPrototypeDeleted: () => void;
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    : "";

export default function ProjectsPageView({
  prototypes,
  isLoading,
  modalOpen,
  settingsOpen,
  activePrototype,
  user,
  onOpenModal,
  onCloseModal,
  onPrototypeCreated,
  onViewPrototype,
  onEditPrototype,
  onOpenSettings,
  onCloseSettings,
  onPrototypeUpdated,
  onPrototypeDeleted,
}: ProjectsPageViewProps) {

  return (
    <div className="relative min-h-screen text-foreground font-sans">
      <GridBackground />

      <div className="container mx-auto px-6 py-12 max-w-7xl">

        {/* --- Header Section --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              All Projects
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Manage and organize your projects from across all your folders.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Optional Visual Search (Non-functional in this view but good for UI consistency) */}
            {/* <div className="hidden md:flex relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <div className="h-9 w-48 bg-accent/50 border border-border rounded-full text-sm flex items-center pl-9 text-muted-foreground/50 cursor-not-allowed">
                Search projects...
              </div>
            </div> */}

            <Button
              onClick={onOpenModal}
              size="sm"
              className="h-9 px-5 rounded-full font-semibold text-sm transition-all gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Project</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* --- Content Grid --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, index) => (
              <PrototypeThumbnailSkeleton key={index} />
            ))
          ) : prototypes.length > 0 ? (
            prototypes.map((prototype) => (
              <PrototypeThumbnail
                key={prototype.id}
                prototypeName={prototype.name}
                prototypeId={prototype.id}
                thumbnailUrl={prototype.thumbnail_url}
                lastModified={
                  formatDate(prototype.updated_at) ||
                  formatDate(prototype.created_at)
                }
                onView={() => onViewPrototype(prototype.id)}
                onEdit={() => onEditPrototype(prototype.id)}
                onSettings={() => onOpenSettings(prototype)}
              />
            ))
          ) : (
            // Full width empty state
            <div className="col-span-full border border-dashed border-border rounded-2xl bg-accent/20 py-24">
              <EmptyState type="prototypes" onButtonClick={onOpenModal} />
            </div>
          )}
        </div>

        {/* --- Modals --- */}
        <NewPrototypeModal
          open={modalOpen}
          onClose={onCloseModal}
          user={user}
          onCreated={onPrototypeCreated}
        />

        <PrototypeSettingsModal
          open={settingsOpen}
          onClose={onCloseSettings}
          prototype={activePrototype}
          onUpdated={onPrototypeUpdated}
          onDeleted={onPrototypeDeleted}
        />
      </div>
    </div>
  );
}