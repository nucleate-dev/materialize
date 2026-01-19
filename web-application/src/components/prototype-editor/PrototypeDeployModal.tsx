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
import {
  SLUG_RULES,
  isValidSlug,
  normalizeSlug,
  normalizeSlugWhileTyping,
} from "@/lib/utils/slugUtils";
import {
  AlertTriangle,
  Check,
  ChevronUp,
  Copy,
  Info,
  Loader2,
  Rocket,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

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
  const [deployVisibility] = useState<PrototypeVisibility>("PUBLIC");
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
  const [copied, setCopied] = useState(false);
  const [showBuildInfo, setShowBuildInfo] = useState(false);

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

  // Check if slug has changed from the original
  const hasSlugChanged = useMemo(() => {
    const normalizedDeploySlug = normalizeSlug(deploySlug);
    return normalizedDeploySlug !== prototype?.slug;
  }, [deploySlug, prototype?.slug]);

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
          logger.debug("error", "Failed to fetch build history", { error });
          return;
        }

        setBuildHistory(data ?? []);
      } catch (error) {
        logger.debug("error", "Error fetching build history", { error });
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
    if (!isValidSlug(normalized)) {
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
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/deployments/check-slug?slug=${encodeURIComponent(normalized)}&exclude_prototype_id=${encodeURIComponent(prototype.id)}`,
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

        const available = result.data?.available ?? null;
        setSlugAvailable(available);
      } catch {
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
  }, [deploySlug, open, prototype, logger]);

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
      logger.log({
        event: "client_prototype_editor_deploy_submitted",
        properties: {
          prototype_id: prototype.id,
          slug: normalizedSlug,
          visibility: deployVisibility,
          has_sandbox: Boolean(normalizedSandboxUrl),
        },
      });

      // Case 1: Slug changed but latest build is already deployed
      // Just update the slug without redeploying
      if (hasSlugChanged && isLatestBuildDeployed) {
        const { error } = await supabase
          .from("prototypes")
          .update({ slug: normalizedSlug })
          .eq("id", prototype.id);

        if (error) {
          setSlugError("Failed to update slug");
          logger.debug("error", "Failed to update slug", { error });
          return;
        }

        const deployUrl = `https://${normalizedSlug}.nucleate.site`;

        onDeploySuccess({
          slug: normalizedSlug,
          url: deployUrl,
          visibility: deployVisibility,
        });

        onOpenChange(false);
        setSlugError(null);
        setSlugAvailable(true);
        toast.success("Slug updated successfully!");
        return;
      }

      // Case 2: Latest build is not deployed (regardless of slug change)
      // Call the deploy endpoint to update slug and deploy
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
    hasSlugChanged,
    isLatestBuildDeployed,
  ]);

  const handleCopyUrl = useCallback(() => {
    if (!deploySlug) return;

    const fullUrl = `https://${normalizeSlug(deploySlug)}.nucleate.site`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    logger.log({
      event: "client_prototype_editor_deployment_url_copied",
      properties: {
        prototype_id: prototype?.id,
        slug: deploySlug,
        url: fullUrl,
      },
    });
  }, [deploySlug, logger, prototype?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-background border border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" />
            Deploy {prototype?.name ?? "Project"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Create a production build of your project to share with live users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Url
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 bg-accent border border-border rounded-md">
                <span className="pl-3 pr-3 text-muted-foreground text-sm">
                  https://
                </span>
                <Input
                  value={deploySlug}
                  onChange={(e) => {
                    setDeploySlug(normalizeSlugWhileTyping(e.target.value));
                    setSlugAvailable(null);
                    setSlugError(null);
                  }}
                  className="border-0 bg-transparent text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                  placeholder="my-app"
                />
                <span className="pr-3 pl-1 text-muted-foreground text-sm">
                  .nucleate.site
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyUrl}
                disabled={!deploySlug}
                className="h-10 pl-3 text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              <div className="w-24 text-xs text-right">
                {isCheckingSlug && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking
                  </span>
                )}
                {!isCheckingSlug && slugAvailable === true && (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Check className="w-3 h-3" /> Available
                  </span>
                )}
                {!isCheckingSlug && slugAvailable === false && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <AlertTriangle className="w-3 h-3" /> Taken
                  </span>
                )}
              </div>
            </div>
            {slugError && <p className="text-xs text-warning">{slugError}</p>}
          </div>

          {/* Build History Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Build History
                </p>
                <button
                  type="button"
                  onClick={() => setShowBuildInfo(!showBuildInfo)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showBuildInfo ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <Info className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {isLoadingHistory && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </div>

            {showBuildInfo && (
              <div className="text-xs text-muted-foreground bg-accent/50 rounded-md p-3 space-y-2">
                <p>
                  Each time you make changes to your app, we automatically
                  create a <strong className="text-foreground">build</strong> —
                  a snapshot of your app at that moment.
                </p>
                <p>
                  When you click{" "}
                  <strong className="text-foreground">Save &amp; deploy</strong>
                  , we publish your latest build so anyone with the link can use
                  it.
                </p>
              </div>
            )}

            {buildHistory.length === 0 && !isLoadingHistory && (
              <p className="text-xs text-muted-foreground italic">
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
                      className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${
                        isDeployed
                          ? "bg-success/10 border-success/30"
                          : "bg-accent border-border"
                      }`}
                    >
                      {/* Build ID with badges */}
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-mono text-foreground">
                          {build.id.slice(-8)}
                        </p>
                        {isLatest && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary/20 text-primary border border-primary/30 whitespace-nowrap">
                            Latest
                          </span>
                        )}
                        {isDeployed && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-success/20 text-success border border-success/30 whitespace-nowrap">
                            Deployed
                          </span>
                        )}
                      </div>

                      {/* Build status */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        <p className="text-xs text-success">Ready</p>
                      </div>

                      {/* Build time */}
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {buildDate.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={Boolean(
                isDeploying ||
                isCheckingSlug ||
                slugAvailable !== true ||
                slugError ||
                (!hasSlugChanged && isLatestBuildDeployed),
              )}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
      </DialogContent>
    </Dialog>
  );
}
