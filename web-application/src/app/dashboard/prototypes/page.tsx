"use client";

import { supabase } from "@/ClientConstants";
import EmptyState from "@/components/dashboard/EmptyState";
import NewPrototypeModal from "@/components/dashboard/NewPrototypeModal";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import PrototypeThumbnail from "@/components/dashboard/PrototypeThumbnail";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

export default function PrototypesPage() {
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
    fetchPrototypes(); // Refetch prototypes after creation
    router.push(`/dashboard/prototypes/${prototypeId}`);
  };

  const handleOpenSettings = (prototype: Prototype) => {
    setActivePrototype(prototype);
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
    setActivePrototype(null);
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {/* Page Header */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl md:text-title-xl2 font-bold text-black dark:text-white mb-2">
                All prototypes
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-body dark:text-bodydark">
                Manage and organize your prototypes from across all your
                projects
              </CardDescription>
            </div>

            {/* New Prototype Button */}
            <div className="flex-shrink-0">
              <Button
                onClick={handleOpenModal}
                size="lg"
                className="w-full sm:w-auto gap-2"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">New Prototype</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Modal for new prototype */}
      <NewPrototypeModal
        open={modalOpen}
        onClose={handleCloseModal}
        user={user}
        onCreated={handlePrototypeCreated}
      />

      {/* Prototypes Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {prototypes.length > 0 ? (
            prototypes.map((prototype) => (
              <PrototypeThumbnail
                key={prototype.id}
                prototypeName={prototype.name}
                thumbnailUrl={prototype.thumbnail_url}
                lastModified={
                  prototype.updated_at
                    ? new Date(prototype.updated_at).toLocaleDateString()
                    : new Date(prototype.created_at!).toLocaleDateString()
                }
                onView={() => router.push(`/prototype/${prototype.id}`)}
                onEdit={() =>
                  router.push(`/dashboard/prototypes/${prototype.id}`)
                }
                onSettings={() => handleOpenSettings(prototype)}
              />
            ))
          ) : (
            <EmptyState type="prototypes" onButtonClick={handleOpenModal} />
          )}
        </div>
      )}

      <PrototypeSettingsModal
        open={settingsOpen}
        onClose={handleCloseSettings}
        prototype={activePrototype}
        onUpdated={() => {
          fetchPrototypes();
          handleCloseSettings();
        }}
      />
    </div>
  );
}
