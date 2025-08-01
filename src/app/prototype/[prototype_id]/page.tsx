"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import Loader from "@/components/dashboard/Loader";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import ExpoSnackViewer from "@/components/ExpoSnackViewer";
import {
  SparklesIcon,
  DocumentDuplicateIcon,
  ShareIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export default function PrototypePage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ prototype_id: string }>();
  const router = useRouter();
  const prototypeId = params?.prototype_id;

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [prototypeFiles, setPrototypeFiles] = useState<
    Record<string, PrototypeFile>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

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
      const { data: newPrototype, error: prototypeError } = await supabase
        .from("prototypes")
        .insert({
          name: clonedPrototypeName,
          description: prototype.description,
          owner_id: user.id,
          project_id: prototype.project_id,
          prototype_context: prototype.prototype_context,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (prototypeError) {
        throw prototypeError;
      }

      // Copy all files to the new prototype
      const filesToCopy = Object.values(prototypeFiles).map((file) => ({
        prototype_id: newPrototype.id,
        name: file.name,
        contents: file.contents,
      }));

      const { error: filesError } = await supabase
        .from("prototype_files")
        .insert(filesToCopy);

      if (filesError) {
        throw filesError;
      }

      // Navigate to the new prototype in dashboard
      router.push(`/dashboard/prototypes/${newPrototype.id}`);
    } catch (err) {
      console.error("Error cloning prototype:", err);
      setError(
        err instanceof Error ? err.message : "Failed to clone prototype",
      );
    } finally {
      setIsCloning(false);
    }
  };

  if (userIsLoading || isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="h-screen bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4 flex items-center justify-center">
        <div className="text-center bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl p-8 rounded-3xl border border-white/20 dark:border-strokedark/30 shadow-2xl">
          <div className="w-16 h-16 bg-gradient-to-br from-meta-1 to-meta-6 rounded-full flex items-center justify-center mx-auto mb-4">
            <SparklesIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
            Oops! Something went wrong
          </h2>
          <p className="text-body dark:text-bodydark">{error}</p>
        </div>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4 flex items-center justify-center">
        <div className="text-center bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl p-8 rounded-3xl border border-white/20 dark:border-strokedark/30 shadow-2xl">
          <div className="w-16 h-16 bg-gradient-to-br from-meta-3 to-meta-5 rounded-full flex items-center justify-center mx-auto mb-4">
            <EyeIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
            Prototype Not Found
          </h2>
          <p className="text-body dark:text-bodydark">
            The prototype you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4 overflow-hidden">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-meta-5/10 to-meta-3/10 dark:from-meta-5/20 dark:to-meta-3/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-meta-6/10 to-primary/10 dark:from-meta-6/20 dark:to-primary/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl border-b border-white/20 dark:border-strokedark/30 shadow-lg">
          {/* Inner glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/40 via-transparent to-primary/5 dark:from-white/5 dark:to-primary/10 pointer-events-none"></div>

          <div className="relative z-10 px-8 py-6">
            <div className="flex items-center justify-between">
              {/* Left side - Prototype info */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10 rounded-full blur-2xl animate-pulse"></div>
                  <div className="relative p-4 bg-gradient-to-br from-primary to-secondary dark:from-primary dark:to-secondary rounded-2xl shadow-2xl shadow-primary/25 dark:shadow-primary/40 ring-1 ring-white/20 dark:ring-primary/30">
                    <SparklesIcon className="w-8 h-8 text-white drop-shadow-lg" />
                  </div>
                </div>

                <div>
                  <h1 className="text-3xl font-bold text-black dark:text-white mb-2">
                    {prototype.name}
                  </h1>
                  {prototype.description && (
                    <p className="text-body dark:text-bodydark text-lg leading-relaxed">
                      {prototype.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2 text-sm text-body dark:text-bodydark">
                      <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
                      <span>
                        {Object.keys(prototypeFiles).length} files •{" "}
                        {prototype.visibility?.toLowerCase() || "private"}
                      </span>
                    </div>
                    {prototype.created_at && (
                      <div className="text-sm text-body dark:text-bodydark">
                        Created{" "}
                        {new Date(prototype.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right side - Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClonePrototype}
                  disabled={isCloning || !user}
                  className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 flex items-center gap-3 ${
                    isCloning || !user
                      ? "bg-stroke/50 dark:bg-strokedark/50 text-body/40 dark:text-bodydark/40 cursor-not-allowed"
                      : "bg-gradient-to-r from-primary via-secondary to-meta-5 hover:from-primary/90 hover:via-secondary/90 hover:to-meta-5/90 text-white hover:scale-105 hover:shadow-xl hover:shadow-primary/40 dark:hover:shadow-primary/60 ring-2 ring-white/20 dark:ring-primary/30 hover:ring-white/30 dark:hover:ring-primary/50"
                  }`}
                >
                  {/* Button glow effect */}
                  {!isCloning && !(!user) && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/30 to-secondary/30 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  )}

                  {isCloning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-body/30 border-t-body rounded-full animate-spin"></div>
                      <span className="relative">Cloning...</span>
                    </>
                  ) : (
                    <>
                      <DocumentDuplicateIcon className="relative w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
                      <span className="relative">Clone Prototype</span>
                    </>
                  )}
                </button>

                <button className="group p-3 bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 rounded-xl border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110">
                  <ShareIcon className="w-5 h-5 text-body dark:text-bodydark group-hover:text-primary dark:group-hover:text-primary transition-colors duration-300" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - ExpoSnackViewer */}
        <div className="flex-1 p-8">
          <div className="h-full bg-white/60 dark:bg-boxdark/60 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-strokedark/30 shadow-2xl overflow-hidden">
            {/* Inner glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-primary/5 dark:from-white/5 dark:to-primary/10 rounded-3xl pointer-events-none"></div>

            <div className="relative z-10 h-full">
              <ExpoSnackViewer files={prototypeFiles} hideControls={true} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}