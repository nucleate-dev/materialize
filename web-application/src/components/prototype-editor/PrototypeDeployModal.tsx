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
  Loader2,
  Rocket,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  // Initialize state when modal opens
  useEffect(() => {
    if (!open || !prototype) return;

    const suggestedSlug =
      prototype.slug || normalizeSlug(prototype.name ?? "") || prototype.id;
    setDeploySlug(suggestedSlug);
    setSlugAvailable(null);
    setSlugError(null);
  }, [open, prototype]);

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

  const handleGenerateSlug = useCallback(() => {
    const base = normalizeSlug(prototype?.name ?? "app");
    const suffix = prototype?.id ? prototype.id.slice(0, 4) : "";
    const candidate = [base, suffix].filter(Boolean).join("-");
    setDeploySlug(candidate || "my-app");
    setSlugAvailable(null);
    setSlugError(null);
  }, [prototype]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#141517] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-400" />
            Deploy Project
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8A8F98]">
            Expose your project or prototype at apps.nucleate.dev
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#8A8F98]">
              Name
            </p>
            <Input
              readOnly
              value={prototype?.name ?? ""}
              className="bg-[#0B0C0E] border-white/10 text-white/80"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-[#8A8F98]">
                Slug
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSlug}
                className="h-8 px-2 border-white/10 text-white/80"
              >
                Auto-generate
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={deploySlug}
                onChange={(e) => {
                  setDeploySlug(e.target.value);
                  setSlugAvailable(null);
                  setSlugError(null);
                }}
                className="bg-[#0B0C0E] border-white/10 text-white"
                placeholder="my-app"
              />
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
            <p className="text-xs text-[#8A8F98]">
              {APPS_BASE_URL}/{deploySlug || "<slug>"}
            </p>
            {slugError && (
              <p className="text-xs text-amber-400">{slugError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
      </DialogContent>
    </Dialog>
  );
}
