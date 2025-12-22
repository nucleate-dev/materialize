"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { type PrototypeVisibility } from "@/lib/types/prototypes";
import { Database } from "@/lib/types/supabase";
import { SLUG_RULES, isValidSlug, normalizeSlug } from "@/lib/utils/slugUtils";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Loader2,
  PackageCheck,
  Rocket,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

const APPS_BASE_URL = (
  process.env.NEXT_PUBLIC_APPS_BASE_URL ??
  process.env.NEXT_PUBLIC_APPS_HOST ??
  "https://apps.nucleate.dev"
).replace(/\/$/, "");

interface PrototypeDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prototype: Prototype | null;
  normalizedSandboxUrl: string | null;
  onDeploySuccess: (result: {
    slug: string;
    url: string;
    visibility: PrototypeVisibility;
  }) => void;
}

export default function PrototypeDeployModal({
  open,
  onOpenChange,
  prototype,
  normalizedSandboxUrl,
  onDeploySuccess,
}: PrototypeDeployModalProps) {
  const logger = useProductLogger();

  const [deploySlug, setDeploySlug] = useState("");
  const [deployVisibility, setDeployVisibility] =
    useState<PrototypeVisibility>("PUBLIC");
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [buildHistory, setBuildHistory] = useState<
    Array<{
      id: string;
      build_key: string;
      deploy_key: string;
      created_at: string;
    }>
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Check if latest build is deployed
  const isLatestBuildDeployed = useMemo(() => {
    if (!prototype || buildHistory.length === 0) return false;

    const latestBuild = buildHistory[0];
    return (
      latestBuild.deploy_key &&
      prototype.latest_deploy_key &&
      latestBuild.deploy_key === prototype.latest_deploy_key
    );
  }, [prototype, buildHistory]);

  // Initialize state when modal opens
  useEffect(() => {
    if (!open || !prototype) return;

    const suggestedSlug =
      prototype.slug || normalizeSlug(prototype.name ?? "") || prototype.id;
    setDeploySlug(suggestedSlug);
    setSlugAvailable(null);
    setSlugError(null);
  }, [open, prototype]);

  // Fetch build history when modal opens
  useEffect(() => {
    if (!open || !prototype) return;

    const fetchBuildHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from("prototype_build_history")
          .select("id, build_key, deploy_key, created_at")
          .eq("prototype_id", prototype.id)
          .order("created_at", { ascending: false });

        if (error) {
          logger.error("error", "Failed to fetch build history", { error });
          return;
        }

        setBuildHistory(data ?? []);
      } catch (error) {
        logger.error("error", "Error fetching build history", { error });
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchBuildHistory();
  }, [open, prototype, logger]);

  // Slug validation effect
  useEffect(() => {
    if (!open || !prototype) return;

    if (!deploySlug) {
      setSlugAvailable(null);
      setSlugError(null);
      setIsCheckingSlug(false);
      return;
    }

    const normalized = normalizeSlug(deploySlug);
    if (deploySlug !== normalized) {
      setDeploySlug(normalized);
      return;
    }

    if (!isValidSlug(deploySlug)) {
      setSlugError(
        `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
      );
      setSlugAvailable(null);
      setIsCheckingSlug(false);
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();
    setIsCheckingSlug(true);
    setSlugError(null);

    const checkSlug = async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          setSlugError("Authentication required");
          setSlugAvailable(null);
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/deployments/check-slug?slug=${encodeURIComponent(deploySlug)}&exclude_prototype_id=${encodeURIComponent(prototype.id)}`,
          {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const result = await response.json();

        if (!isCurrent) return;

        if (!response.ok || result.error) {
          setSlugError(
            result.error?.message ?? "Unable to check slug availability",
          );
          setSlugAvailable(null);
          return;
        }

        setSlugAvailable(result.data?.available ?? null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSlugError("Unable to check slug availability");
          setSlugAvailable(null);
        }
      } finally {
        if (isCurrent) {
          setIsCheckingSlug(false);
        }
      }
    };

    const timeoutId = setTimeout(checkSlug, 300);

    return () => {
      isCurrent = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [deploySlug, open, prototype]);

  const handleDeploy = useCallback(async () => {
    if (!prototype) return;

    const normalizedSlug = normalizeSlug(deploySlug);
    if (!normalizedSlug || !isValidSlug(normalizedSlug)) {
      setSlugError(
        `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
      );
      return;
    }

    try {
      setIsDeploying(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error("You must be signed in to deploy");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/deployments/deploy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            prototype_id: prototype.id,
            slug: normalizedSlug,
            visibility: deployVisibility,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        setSlugError(result.error?.message ?? "Unable to deploy app");
        return;
      }

      // API returns { data: { url: string }, error: null }
      const deployUrl = result.data?.url;

      if (!deployUrl) {
        setSlugError("Deployment succeeded but no URL was returned");
        return;
      }

      onDeploySuccess({
        slug: normalizedSlug,
        url: deployUrl,
        visibility: deployVisibility,
      });

      onOpenChange(false);
      setSlugError(null);
      setSlugAvailable(true);

      // Trigger build-and-deploy on sandbox (fire and forget)
      if (normalizedSandboxUrl) {
        fetch(`${normalizedSandboxUrl}/build-and-deploy`, {
          method: "POST",
        }).catch((err) => {
          logger.debug("error", "Failed to trigger build-and-deploy", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        toast.success(
          "Deploy started! Expect your new deploy to be up in about 3-5 minutes.",
        );
      }
    } catch (error) {
      setSlugError(
        error instanceof Error ? error.message : "Unable to deploy app",
      );
    } finally {
      setIsDeploying(false);
    }
  }, [
    prototype,
    deploySlug,
    deployVisibility,
    normalizedSandboxUrl,
    logger,
    onDeploySuccess,
    onOpenChange,
  ]);

  const handleCopyUrl = useCallback(() => {
    if (!deploySlug) return;

    const fullUrl = `https://${deploySlug}.app.nucleate.dev`;
    navigator.clipboard.writeText(fullUrl);
    toast.success("URL copied to clipboard!");
  }, [deploySlug]);

  const handleDeployLatestBuild = useCallback(async () => {
    if (!prototype || !normalizedSandboxUrl) return;

    try {
      setIsDeploying(true);

      // Trigger build-and-deploy on sandbox
      const response = await fetch(`${normalizedSandboxUrl}/build-and-deploy`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to trigger deployment");
      }

      toast.success(
        "Deploy started! Expect your new deploy to be up in about 3-5 minutes.",
      );

      // Refresh build history after a short delay to show the new deployment
      setTimeout(() => {
        const fetchBuildHistory = async () => {
          const { data, error } = await supabase
            .from("prototype_build_history")
            .select("id, build_key, deploy_key, created_at")
            .eq("prototype_id", prototype.id)
            .order("created_at", { ascending: false });

          if (!error && data) {
            setBuildHistory(data);
          }
        };
        fetchBuildHistory();
      }, 1000);
    } catch (error) {
      logger.error("error", "Failed to deploy latest build", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to start deployment");
    } finally {
      setIsDeploying(false);
    }
  }, [prototype, normalizedSandboxUrl, logger]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#141517] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-400" />
            Deploy {prototype?.name ?? "Project"}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8A8F98]">
            Create a production build of your project to share with live users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#8A8F98]">
              Url
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 bg-[#0B0C0E] border border-white/10 rounded-md">
                <span className="pl-3 pr-3 text-white/60 text-sm">
                  https://
                </span>
                <Input
                  value={deploySlug}
                  onChange={(e) => {
                    setDeploySlug(e.target.value);
                    setSlugAvailable(null);
                    setSlugError(null);
                  }}
                  className="border-0 bg-transparent text-white focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                  placeholder="my-app"
                />
                <span className="pr-3 pl-1 text-white/60 text-sm">
                  .app.nucleate.dev
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyUrl}
                disabled={!deploySlug}
                className="h-10 pl-3 text-white/80 hover:text-white"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <div className="w-24 text-xs text-right">
                {isCheckingSlug && (
                  <span className="inline-flex items-center gap-1 text-[#8A8F98]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking
                  </span>
                )}
                {!isCheckingSlug && slugAvailable === true && (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Check className="w-3 h-3" /> Available
                  </span>
                )}
                {!isCheckingSlug && slugAvailable === false && (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> Taken
                  </span>
                )}
              </div>
            </div>
            {slugError && <p className="text-xs text-amber-400">{slugError}</p>}
          </div>

          {/* Build History Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-[#8A8F98]">
                Build History
              </p>
              {isLoadingHistory && (
                <Loader2 className="w-3 h-3 animate-spin text-[#8A8F98]" />
              )}
            </div>

            {buildHistory.length === 0 && !isLoadingHistory && (
              <p className="text-xs text-[#8A8F98] italic">
                No builds found for this project
              </p>
            )}

            {buildHistory.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {buildHistory.map((build, index) => {
                  const isDeployed =
                    build.deploy_key &&
                    prototype?.latest_deploy_key &&
                    build.deploy_key === prototype.latest_deploy_key;
                  const isLatest = index === 0;
                  const buildDate = new Date(build.created_at);

                  return (
                    <div
                      key={build.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        isDeployed
                          ? "bg-emerald-950/20 border-emerald-500/30"
                          : "bg-[#0B0C0E] border-white/5"
                      }`}
                    >
                      <div className="mt-0.5">
                        {isDeployed ? (
                          <PackageCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-[#8A8F98]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-white">
                            Build {build.build_key}
                          </p>
                          {isLatest && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Latest
                            </span>
                          )}
                          {isDeployed && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Deployed
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8A8F98]">
                          {buildDate.toLocaleString()}
                        </p>
                        {build.deploy_key && (
                          <p className="text-[10px] text-[#8A8F98]">
                            Deploy: {build.deploy_key}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-2">
            {/* Deploy Latest Build Button */}
            <div className="space-y-2">
              <Button
                onClick={handleDeployLatestBuild}
                disabled={
                  isDeploying || isLatestBuildDeployed || !prototype?.slug
                }
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-[#0B0C0E] disabled:text-[#8A8F98]"
                variant={
                  isLatestBuildDeployed || !prototype?.slug
                    ? "outline"
                    : "default"
                }
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <PackageCheck className="w-4 h-4 mr-2" />
                    Deploy Latest Build to Production
                  </>
                )}
              </Button>
              {isLatestBuildDeployed && (
                <p className="text-xs text-emerald-400 text-center">
                  ✓ Your deployment is already up to date
                </p>
              )}
              {!prototype?.slug && !isLatestBuildDeployed && (
                <p className="text-xs text-amber-400 text-center">
                  Please set a slug first before deploying
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-white/80 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeploy}
                disabled={
                  isDeploying ||
                  isCheckingSlug ||
                  slugAvailable === false ||
                  !!slugError
                }
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Deploying...
                  </>
                ) : (
                  "Save & deploy"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
