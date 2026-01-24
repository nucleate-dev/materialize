"use client";

import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ProjectsPageView from "./ProjectsPageView";
import { Prototype } from "./types";

const PAGE_SIZE = 12;

export default function ProjectsPageContainer() {
  const { user } = useUser();
  const { activeTeam } = useActiveTeam();
  const router = useRouter();
  const logger = useProductLogger();
  const [modalOpen, setModalOpen] = useState(false);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePrototype, setActivePrototype] = useState<Prototype | null>(
    null,
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchPrototypes = useCallback(
    async ({
      offset: start = 0,
      append = false,
    }: { offset?: number; append?: boolean } = {}) => {
      if (!activeTeam?.id) {
        setPrototypes([]);
        setHasMore(false);
        setIsLoading(false);
        setIsFetchingMore(false);
        setOffset(0);
        return;
      }

      if (append) {
        setIsFetchingMore(true);
      } else {
        setIsLoading(true);
        setHasMore(true);
        setOffset(0);
      }

      try {
        const from = start;
        const to = start + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("prototypes")
          .select(`
            *,
            owner:users!owner_id (
              id,
              name,
              email,
              avatar_url
            )
          `)
          .eq("team_id", activeTeam.id)
          .order("updated_at", { ascending: false })
          .range(from, to);

        if (error) {
          logger.debug("error", "Error fetching prototypes:", {
            ...error,
          });
          return;
        }

        const nextData = data || [];
        setPrototypes((prev) => (append ? [...prev, ...nextData] : nextData));
        setHasMore(nextData.length === PAGE_SIZE);
        setOffset((prev) =>
          append ? prev + nextData.length : nextData.length,
        );
      } catch (error) {
        logger.debug("error", "Error fetching prototypes:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        if (append) {
          setIsFetchingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [activeTeam?.id, logger],
  );

  useEffect(() => {
    fetchPrototypes();
  }, [fetchPrototypes]);

  const loadMore = useCallback(() => {
    if (isLoading || isFetchingMore || !hasMore) {
      return;
    }
    fetchPrototypes({ offset, append: true });
  }, [fetchPrototypes, offset, isLoading, isFetchingMore, hasMore]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasMore]);

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
    setPrototypes((prev) => prev.filter((p) => p.id !== activePrototype?.id));
    setOffset((prev) => Math.max(prev - 1, 0));
    handleCloseSettings();
  };

  const handleViewPrototype = (prototypeId: string) => {
    router.push(`/p/${prototypeId}`);
  };

  const handleEditPrototype = (prototypeId: string) => {
    router.push(`/dashboard/projects/${prototypeId}`);
  };

  return (
    <ProjectsPageView
      prototypes={prototypes}
      isLoading={isLoading}
      isFetchingMore={isFetchingMore}
      hasMore={hasMore}
      loadMoreRef={loadMoreRef}
      modalOpen={modalOpen}
      settingsOpen={settingsOpen}
      activePrototype={activePrototype}
      user={user}
      teamName={activeTeam?.name ?? null}
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
