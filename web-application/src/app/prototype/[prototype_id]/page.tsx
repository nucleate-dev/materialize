"use client";

import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
// import ExpoSnackViewer from "@/components/ExpoSnackViewer";
import MaterializeRenderSection from "@/components/MaterializeRenderSection";
import PublicPrototypeHeader from "@/components/PublicPrototypeHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import type {
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
} from "@/lib/types/serverAPITypes";
import { EyeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [prototypeFiles, setPrototypeFiles] = useState<
    Record<string, PrototypeFile>
  >({});
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Call fetch-viewing-url API to get viewing URL
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

          if (!serverEndpoint) {
            console.error("Server endpoint not configured");
            return;
          }

          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const fetchViewResponse = await fetch(
            `${serverEndpoint}/prototype/fetch-viewing-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                prototype_id: prototypeId,
                current_page: "view",
              } as FetchViewingUrlRequestBody),
            },
          );

          if (fetchViewResponse.ok) {
            const fetchViewData: FetchViewingUrlResponse =
              await fetchViewResponse.json();
            if ("viewing_url" in fetchViewData) {
              console.log("Viewing URL:", fetchViewData.viewing_url);
              setViewingUrl(fetchViewData.viewing_url);
              console.log("Source:", fetchViewData.source);
            } else {
              console.error(
                "Error in fetch-viewing-url response:",
                fetchViewData,
              );
            }
          } else {
            console.error(
              "Failed to fetch viewing URL:",
              fetchViewResponse.status,
            );
          }
        } catch (fetchViewError) {
          console.error("Error calling fetch-viewing-url API:", fetchViewError);
        }
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

  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
  };

  if (isLoading) {
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
            onUpdatePrototype={handleUpdatePrototype}
          />

          {/* Main Content - ExpoSnackViewer */}
          <div className="flex-1 p-8">
            <Card className="h-full overflow-hidden">
              <CardContent className="h-full p-0">
                <MaterializeRenderSection
                  viewing_url={viewingUrl ?? ""}
                  onRenderStatusChange={() => {
                    // no-op
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
