"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import ProjectsPageView from "./ProjectsPageView";
import { Prototype } from "./types";

export default function ProjectsPageContainer() {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();
  const [modalOpen, setModalOpen] = useState(false);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePrototype, setActivePrototype] = useState<Prototype | null>(
    null,
  );

  const fetchPrototypes = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        logger.debug("error", "Error fetching prototypes:", {
          ...error,
        });
        return;
      }

      setPrototypes(data || []);
    } catch (error) {
      logger.debug("error", "Error fetching prototypes:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, logger]);

  useEffect(() => {
    fetchPrototypes();
  }, [fetchPrototypes]);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  const handlePrototypeCreated = (prototypeId: string) => {
    fetchPrototypes();
    router.push(`/dashboard/projects/${prototypeId}`);
  };

  const handleOpenSettings = (prototype: Prototype) => {
    setActivePrototype(prototype);
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
    setActivePrototype(null);
  };

  const handlePrototypeUpdated = (updatedPrototype: Prototype) => {
    setPrototypes((prev) =>
      prev.map((p) => (p.id === updatedPrototype.id ? updatedPrototype : p)),
    );
    handleCloseSettings();
  };

  const handlePrototypeDeleted = () => {
    setPrototypes((prev) =>
      prev.filter((p) => p.id !== activePrototype?.id),
    );
    handleCloseSettings();
  };

  const handleViewPrototype = (prototypeId: string) => {
    router.push(`/project/${prototypeId}`);
  };

  const handleEditPrototype = (prototypeId: string) => {
    router.push(`/dashboard/projects/${prototypeId}`);
  };

  return (
    <ProjectsPageView
      prototypes={prototypes}
      isLoading={isLoading}
      modalOpen={modalOpen}
      settingsOpen={settingsOpen}
      activePrototype={activePrototype}
      user={user}
      onOpenModal={handleOpenModal}
      onCloseModal={handleCloseModal}
      onPrototypeCreated={handlePrototypeCreated}
      onViewPrototype={handleViewPrototype}
      onEditPrototype={handleEditPrototype}
      onOpenSettings={handleOpenSettings}
      onCloseSettings={handleCloseSettings}
      onPrototypeUpdated={handlePrototypeUpdated}
      onPrototypeDeleted={handlePrototypeDeleted}
    />
  );
}
