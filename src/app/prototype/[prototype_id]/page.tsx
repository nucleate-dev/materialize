"use client";

import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import ExpoSnackViewer from "@/components/ExpoSnackViewer";
import PublicPrototypeHeader from "@/components/PublicPrototypeHeader";
import { createPrototype } from "@/lib/utils/prototypes";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import ProPlanUpsellModal from "@/components/ProPlanUpsellModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/hooks/useUser";
import { EyeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export default function PrototypePage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ prototype_id: string }>();
  const router = useRouter();
  const prototypeId = params?.prototype_id;

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [prototypeFiles, setPrototypeFiles] = useState<Record<string, PrototypeFile>>({});
  const { userPlan } = useSubscriptionAccess();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);

  useEffect(() => {
    async function fetchPrototypeData() {
      if (!prototypeId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch prototype data
        const { data: prototypeData, error: prototypeError } = await supabase
          .from("prototypes")
          .select("*")
          .eq("id", prototypeId)
          .single();

        if (prototypeError) {
          throw prototypeError;
        }

        setPrototype(prototypeData);

        // Fetch prototype files
        const { data: filesData, error: filesError } = await supabase
          .from("prototype_files")
          .select("*")
          .eq("prototype_id", prototypeId);

        if (filesError) {
          throw filesError;
        }

        // Convert files array to object keyed by filename
        const filesObject = filesData.reduce(
          (acc, file) => {
            acc[file.name] = file;
            return acc;
          },
          {} as Record<string, PrototypeFile>,
        );

        setPrototypeFiles(filesObject);
      } catch (err) {
        console.error("Error fetching prototype data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load prototype",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrototypeData();
  }, [prototypeId]);

  const handleClonePrototype = async () => {
    if (!user || !prototype || !prototypeId) return;

    try {
      setIsCloning(true);

      // Create new prototype
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const result = await createPrototype(
        supabase,
        {
          name: clonedPrototypeName,
          description: prototype.description,
          owner_id: user.id,
          project_id: prototype.project_id,
          prototype_context: prototype.prototype_context,
          visibility: "SELF" as const,
        },
        userPlan,
        Object.values(prototypeFiles).map((file) => ({
          name: file.name,
          contents: file.contents,
        })),
      );

      if (result.success) {
        // Navigate to the new prototype in dashboard
        router.push(`/dashboard/prototypes/${result.data.id}`);
      } else if (result.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error("Error cloning prototype:", err);
      setError(
        err instanceof Error ? err.message : "Failed to clone prototype",
      );
    } finally {
      setIsCloning(false);
    }
  };


  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
  };

  if (userIsLoading || isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive rounded-full flex items-center justify-center mx-auto mb-4">
              <SparklesIcon className="w-8 h-8 text-destructive-foreground" />
            </div>
            <CardTitle className="text-2xl">
              Oops! Something went wrong
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <EyeIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Prototype Not Found</CardTitle>
            <CardDescription>
              The prototype you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to view it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen bg-background overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Header */}
        <PublicPrototypeHeader
          prototype={prototype}
          prototypeFiles={prototypeFiles}
          isCloning={isCloning}
          onClonePrototype={handleClonePrototype}
          onUpdatePrototype={handleUpdatePrototype}
        />

        {/* Main Content - ExpoSnackViewer */}
        <div className="flex-1 p-8">
          <Card className="h-full overflow-hidden">
            <CardContent className="h-full p-0">
              <ExpoSnackViewer
                files={prototypeFiles}
                hideControls={true}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      </div>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </>
  );
}
