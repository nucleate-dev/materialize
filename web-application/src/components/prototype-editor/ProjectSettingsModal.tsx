"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type { PrototypeVisibility } from "@/lib/types/prototypes";
import type {
  APIResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import {
  isValidSlug,
  normalizeSlug,
  normalizeSlugWhileTyping,
  SLUG_RULES,
} from "@/lib/utils/slugUtils";
import {
  AlertTriangle,
  Check,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Key,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeEnvVarRow =
  Database["public"]["Tables"]["prototype_env_vars"]["Row"];
type PrototypeEnvVarSecretRow =
  Database["public"]["Tables"]["prototype_env_var_secrets"]["Row"];

type PrototypeEnvVar = PrototypeEnvVarRow & {
  secret_value: PrototypeEnvVarSecretRow["secret_value"];
};

interface NewEnvVarInput {
  id: string;
  name: string;
  value: string;
  visibility: "client" | "backend";
}

export type ProjectSettingsTab = "details" | "deploy" | "share" | "environment" | "github";

interface ProjectSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: ProjectSettingsTab;
  // Project data
  prototype: Prototype | null;
  prototypeId?: string;
  // For deploy functionality
  normalizedSandboxUrl?: string | null;
  onDeploySuccess?: (result: {
    slug: string;
    url: string;
    visibility: PrototypeVisibility;
  }) => void;
  // For share functionality
  isPublic: boolean;
  onVisibilityChange?: (isPublic: boolean) => void;
  userPlan?: string | null;
  // For env vars
  framework?: string;
  // For name editing
  onNameChange?: (name: string) => void;
  canEditName?: boolean;
  // GitHub integration
  isGithubIntegrationEnabled?: boolean;
  githubIntegration?: { connected: boolean; loading: boolean };
  githubRepository?: { html_url: string | null; loading: boolean };
  onCreateGitHubRepository?: () => void;
  canManageGithub?: boolean;
}

const normalizeEnvVarNameInput = (value: string) => {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
};

export function ProjectSettingsModal({
  open,
  onOpenChange,
  initialTab = "deploy",
  prototype,
  prototypeId,
  normalizedSandboxUrl,
  onDeploySuccess,
  isPublic,
  onVisibilityChange,
  userPlan,
  framework,
  onNameChange,
  canEditName = false,
  isGithubIntegrationEnabled = false,
  githubIntegration,
  githubRepository,
  onCreateGitHubRepository,
  canManageGithub = false,
}: ProjectSettingsModalProps) {
  const logger = useProductLogger();

  // Tab state
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>(initialTab);

  // Sync initial tab when it changes from parent
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // ===== PROJECT NAME STATE =====
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(prototype?.name ?? "");
  const [isSavingName, setIsSavingName] = useState(false);

  // Reset name when prototype changes
  useEffect(() => {
    setEditedName(prototype?.name ?? "");
  }, [prototype?.name]);

  const handleSaveName = async () => {
    if (!prototype || !editedName.trim()) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("prototypes")
        .update({ name: editedName.trim() })
        .eq("id", prototype.id);

      if (error) {
        toast.error("Failed to update project name");
        return;
      }

      onNameChange?.(editedName.trim());
      setIsEditingName(false);
      toast.success("Project name updated");
    } catch {
      toast.error("Failed to update project name");
    } finally {
      setIsSavingName(false);
    }
  };

  // ===== SHARE STATE =====
  const [isCopying, setIsCopying] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopyLink = async () => {
    if (!prototype) return;

    setIsCopying(true);
    try {
      // Make public if not already
      if (!isPublic) {
        await supabase
          .from("prototypes")
          .update({ visibility: "PUBLIC" })
          .eq("id", prototype.id);
        onVisibilityChange?.(true);
      }

      await navigator.clipboard.writeText(
        window.location.href.replace("dashboard/projects", "p"),
      );

      toast.success("Copied!");
      logger.log({
        event: "client_prototype_editor_share_link_copied",
        properties: {
          prototype_id: prototype.id,
          visibility_before: isPublic ? "PUBLIC" : "SELF",
        },
      });

      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      logger.debug("error", "Failed to copy URL:", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleVisibilityToggle = async (checked: boolean) => {
    if (!prototype) return;
    if (!checked && !IsUserPlanSubscribed(userPlan ?? "")) {
      return;
    }

    try {
      const newVisibility: PrototypeVisibility = checked ? "PUBLIC" : "SELF";
      await supabase
        .from("prototypes")
        .update({ visibility: newVisibility })
        .eq("id", prototype.id);

      onVisibilityChange?.(checked);
      logger.log({
        event: "client_prototype_editor_share_visibility_changed",
        properties: {
          prototype_id: prototype.id,
          visibility: newVisibility,
        },
      });
    } catch (err) {
      logger.debug("error", "Failed to update visibility:", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ===== DEPLOY STATE =====
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
  const [deployUrlCopied, setDeployUrlCopied] = useState(false);
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

  // Initialize deploy state when modal opens
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
      if (hasSlugChanged && isLatestBuildDeployed) {
        const { error } = await supabase
          .from("prototypes")
          .update({ slug: normalizedSlug })
          .eq("id", prototype.id);

        if (error) {
          setSlugError("Failed to update slug");
          return;
        }

        const deployUrl = `https://${normalizedSlug}.app.nucleate.dev`;

        onDeploySuccess?.({
          slug: normalizedSlug,
          url: deployUrl,
          visibility: deployVisibility,
        });

        setSlugError(null);
        setSlugAvailable(true);
        toast.success("Slug updated successfully!");
        return;
      }

      // Case 2: Latest build is not deployed
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

      const deployUrl = result.data?.url;

      if (!deployUrl) {
        setSlugError("Deployment succeeded but no URL was returned");
        return;
      }

      onDeploySuccess?.({
        slug: normalizedSlug,
        url: deployUrl,
        visibility: deployVisibility,
      });

      setSlugError(null);
      setSlugAvailable(true);

      // Trigger build-and-deploy on sandbox
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
    hasSlugChanged,
    isLatestBuildDeployed,
  ]);

  const handleCopyDeployUrl = useCallback(() => {
    if (!deploySlug) return;

    const fullUrl = `https://${normalizeSlug(deploySlug)}.app.nucleate.dev`;
    navigator.clipboard.writeText(fullUrl);
    setDeployUrlCopied(true);
    setTimeout(() => setDeployUrlCopied(false), 2000);
  }, [deploySlug]);

  // ===== ENVIRONMENT VARIABLES STATE =====
  const envPrefix =
    framework === "web_nextjs_react" ? "NEXT_PUBLIC_" : "EXPO_PUBLIC_";

  const [envVars, setEnvVars] = useState<PrototypeEnvVar[]>([]);
  const [isLoadingEnvVars, setIsLoadingEnvVars] = useState(false);
  const [isSavingEnvVar, setIsSavingEnvVar] = useState(false);
  const [editingEnvVars, setEditingEnvVars] = useState<Set<string>>(new Set());
  const [updatingEnvVarIds, setUpdatingEnvVarIds] = useState<Set<string>>(
    new Set(),
  );
  const [deletingEnvVarIds, setDeletingEnvVarIds] = useState<Set<string>>(
    new Set(),
  );
  const [envVarFormError, setEnvVarFormError] = useState<string | null>(null);
  const [newEnvVarInputs, setNewEnvVarInputs] = useState<NewEnvVarInput[]>([
    { id: crypto.randomUUID(), name: "", value: "", visibility: "client" },
  ]);
  const [isSyncingEnvFile, setIsSyncingEnvFile] = useState(false);
  const [envSyncWarning, setEnvSyncWarning] = useState<string | null>(null);
  const [envSyncError, setEnvSyncError] = useState<string | null>(null);

  const fetchEnvVars = useCallback(async () => {
    if (!prototypeId) {
      setEnvVars([]);
      return;
    }

    setIsLoadingEnvVars(true);
    setEnvVarFormError(null);
    try {
      const { data, error } = await supabase
        .from("prototype_env_vars")
        .select(
          "id, prototype_id, name, is_public, created_at, updated_at, prototype_env_var_secrets(secret_value)",
        )
        .eq("prototype_id", prototypeId)
        .order("name", { ascending: true });

      if (error) {
        toast.error("Unable to load environment variables");
        return;
      }

      const transformedData: PrototypeEnvVar[] = (data ?? []).map((envVar) => {
        const { prototype_env_var_secrets, ...rest } = envVar as {
          prototype_env_var_secrets:
            | { secret_value: string | null }[]
            | { secret_value: string | null }
            | null;
          [key: string]: unknown;
        };
        let displayName = rest.name as string;
        const secretValue = Array.isArray(prototype_env_var_secrets)
          ? prototype_env_var_secrets[0]?.secret_value
          : prototype_env_var_secrets?.secret_value;

        if (displayName.startsWith(envPrefix)) {
          displayName = displayName.substring(envPrefix.length);
        }
        if (displayName.startsWith(envPrefix)) {
          displayName = displayName.substring(envPrefix.length);
        }

        return {
          ...rest,
          name: displayName,
          secret_value: secretValue ?? null,
        } as PrototypeEnvVar;
      });

      setEnvVars(transformedData);
    } catch {
      toast.error("Unable to load environment variables");
    } finally {
      setIsLoadingEnvVars(false);
    }
  }, [prototypeId, envPrefix]);

  // Fetch env vars when environment tab is active
  useEffect(() => {
    if (open && activeTab === "environment") {
      void fetchEnvVars();
    }
  }, [open, activeTab, fetchEnvVars]);

  const refetchEnvVarsOnDevServer = useCallback(
    async (): Promise<boolean> => {
      setEnvSyncWarning(null);
      setEnvSyncError(null);

      if (!normalizedSandboxUrl || !prototypeId) {
        setEnvSyncWarning(
          "Dev server not started yet, try syncing again soon.",
        );
        return false;
      }

      setIsSyncingEnvFile(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          toast.error("Sign in again to sync environment variables.");
          setEnvSyncError(
            "Error syncing to development server. Try again later.",
          );
          return false;
        }

        const response = await fetch(
          `${normalizedSandboxUrl}/dev-server/refetch-env`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prototype_id: prototypeId }),
          },
        );

        const result: APIResponse<
          { env_var_count: number; message: string },
          StandardErrorResponse
        > = await response.json().catch(() => ({ data: null, error: null }));

        if (!response.ok || result.error) {
          throw new Error(
            result.error?.message ?? "Failed to refresh dev server env vars",
          );
        }

        toast.success("Dev server environment updated");
        return true;
      } catch {
        toast.error("Unable to refresh dev server env vars");
        setEnvSyncError(
          "Error syncing to development server. Try again later.",
        );
        return false;
      } finally {
        setIsSyncingEnvFile(false);
      }
    },
    [normalizedSandboxUrl, prototypeId],
  );

  const handleUpdateEnvVar = useCallback(
    async (envVarId: string, newValue: string) => {
      if (!prototypeId) {
        toast.error("Prototype is still initializing");
        return;
      }

      if (!newValue.trim()) {
        toast.error("Value cannot be empty");
        return;
      }

      setUpdatingEnvVarIds((prev) => new Set(prev).add(envVarId));
      try {
        const { error } = await supabase
          .from("prototype_env_var_secrets")
          .upsert({ env_var_id: envVarId, secret_value: newValue });

        if (error) {
          throw new Error(error.message);
        }

        setEnvVars((prev) =>
          prev.map((envVar) =>
            envVar.id === envVarId
              ? { ...envVar, secret_value: newValue }
              : envVar,
          ),
        );

        setEditingEnvVars((prev) => {
          const updated = new Set(prev);
          updated.delete(envVarId);
          return updated;
        });

        toast.success("Environment variable updated");

        if (normalizedSandboxUrl) {
          await refetchEnvVarsOnDevServer();
        }
      } catch {
        toast.error("Unable to update environment variable");
      } finally {
        setUpdatingEnvVarIds((prev) => {
          const updated = new Set(prev);
          updated.delete(envVarId);
          return updated;
        });
      }
    },
    [prototypeId, normalizedSandboxUrl, refetchEnvVarsOnDevServer],
  );

  const handleDeleteEnvVar = useCallback(
    async (envVarId: string, envVarName: string) => {
      if (!prototypeId) {
        toast.error("Prototype is still initializing");
        return;
      }

      if (
        !confirm(
          `Are you sure you want to delete the environment variable "${envVarName}"?`,
        )
      ) {
        return;
      }

      setDeletingEnvVarIds((prev) => new Set(prev).add(envVarId));
      try {
        const { error } = await supabase
          .from("prototype_env_vars")
          .delete()
          .eq("id", envVarId);

        if (error) {
          toast.error(error.message);
          throw new Error(error.message);
        }

        setEnvVars((prev) => prev.filter((envVar) => envVar.id !== envVarId));
        toast.success("Environment variable deleted");

        if (normalizedSandboxUrl) {
          await refetchEnvVarsOnDevServer();
        }
      } catch {
        toast.error("Unable to delete environment variable");
      } finally {
        setDeletingEnvVarIds((prev) => {
          const updated = new Set(prev);
          updated.delete(envVarId);
          return updated;
        });
      }
    },
    [prototypeId, normalizedSandboxUrl, refetchEnvVarsOnDevServer],
  );

  const handleAddEnvVars = useCallback(async () => {
    if (!prototypeId) {
      setEnvVarFormError("Prototype is still initializing");
      return;
    }

    const validInputs = newEnvVarInputs.filter(
      (input) => input.name.trim() || input.value.trim(),
    );

    if (validInputs.length === 0) {
      setEnvVarFormError("At least one environment variable is required");
      return;
    }

    for (const input of validInputs) {
      let normalizedName = normalizeEnvVarNameInput(input.name);
      if (!normalizedName) {
        setEnvVarFormError(
          `Environment variable name is required for all entries`,
        );
        return;
      }

      if (
        input.visibility === "client" &&
        normalizedName.startsWith(envPrefix)
      ) {
        normalizedName = normalizedName.substring(envPrefix.length);
      }

      if (!input.value.trim()) {
        setEnvVarFormError(`Value is required for ${input.name}`);
        return;
      }

      const finalName =
        input.visibility === "client"
          ? `${envPrefix}${normalizedName}`
          : normalizedName;

      const existingNames = envVars.map((envVar) => {
        if (envVar.is_public) {
          return `${envPrefix}${envVar.name}`;
        }
        return envVar.name;
      });

      if (existingNames.includes(finalName)) {
        setEnvVarFormError(
          `Environment variable "${input.visibility === "client" ? `${envPrefix}${normalizedName}` : normalizedName}" already exists.`,
        );
        return;
      }
    }

    setIsSavingEnvVar(true);
    setEnvVarFormError(null);
    try {
      const envVarSecrets = new Map<string, string>();
      const envVarsToInsert = validInputs.map((input) => {
        let normalizedName = normalizeEnvVarNameInput(input.name);

        if (
          input.visibility === "client" &&
          normalizedName.startsWith(envPrefix)
        ) {
          normalizedName = normalizedName.substring(envPrefix.length);
        }

        const finalName =
          input.visibility === "client"
            ? `${envPrefix}${normalizedName}`
            : normalizedName;

        envVarSecrets.set(finalName, input.value);

        return {
          prototype_id: prototypeId,
          name: finalName,
          is_public: input.visibility === "client",
        };
      });

      const { data: insertedEnvVars, error } = await supabase
        .from("prototype_env_vars")
        .insert(envVarsToInsert)
        .select("id, name");

      if (error) {
        setEnvVarFormError(error.message);
        return;
      }

      const insertedIds = insertedEnvVars?.map((envVar) => envVar.id) ?? [];
      const secretRows =
        insertedEnvVars?.map((envVar) => ({
          env_var_id: envVar.id,
          secret_value: envVarSecrets.get(envVar.name) ?? "",
        })) ?? [];

      if (secretRows.length > 0) {
        const { error: secretError } = await supabase
          .from("prototype_env_var_secrets")
          .upsert(secretRows);
        if (secretError) {
          setEnvVarFormError(secretError.message);
          if (insertedIds.length > 0) {
            await supabase
              .from("prototype_env_vars")
              .delete()
              .in("id", insertedIds);
          }
          return;
        }
      }

      await fetchEnvVars();
      setNewEnvVarInputs([
        {
          id: crypto.randomUUID(),
          name: "",
          value: "",
          visibility: "client",
        },
      ]);
      toast.success(
        `${validInputs.length} environment variable${validInputs.length > 1 ? "s" : ""} added`,
      );

      if (normalizedSandboxUrl) {
        await refetchEnvVarsOnDevServer();
      }
    } catch (error) {
      setEnvVarFormError(
        error instanceof Error ? error.message : "Failed to add variables",
      );
    } finally {
      setIsSavingEnvVar(false);
    }
  }, [
    prototypeId,
    newEnvVarInputs,
    envVars,
    fetchEnvVars,
    normalizedSandboxUrl,
    refetchEnvVarsOnDevServer,
    envPrefix,
  ]);

  const canSyncEnvToDevServer = Boolean(normalizedSandboxUrl && prototypeId);
  const areEnvSecretsHidden =
    envVars.length > 0 && envVars.every((envVar) => !envVar.secret_value);

  // Reset state when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setIsEditingName(false);
      setEnvVarFormError(null);
      setEnvSyncWarning(null);
      setEnvSyncError(null);
      setNewEnvVarInputs([
        {
          id: crypto.randomUUID(),
          name: "",
          value: "",
          visibility: "client",
        },
      ]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-background border border-border text-foreground p-6">
        {/* Tabs - Vertical Layout */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ProjectSettingsTab)}
          className="flex-1 flex flex-row items-start overflow-hidden gap-6"
          orientation="vertical"
        >
          {/* Left Sidebar with Tab Triggers */}
          <TabsList className="flex flex-col justify-start items-stretch h-fit w-44 flex-shrink-0 bg-accent/50 p-2 rounded-lg">
            <TabsTrigger
              value="details"
              className="w-full justify-start gap-3 px-3 py-2.5 data-[state=active]:bg-background"
            >
              <Pencil className="w-4 h-4 flex-shrink-0" />
              <span>Details</span>
            </TabsTrigger>
            <TabsTrigger
              value="deploy"
              className="w-full justify-start gap-3 px-3 py-2.5 data-[state=active]:bg-background"
            >
              <Rocket className="w-4 h-4 flex-shrink-0" />
              <span>Deploy</span>
            </TabsTrigger>
            <TabsTrigger
              value="share"
              className="w-full justify-start gap-3 px-3 py-2.5 data-[state=active]:bg-background"
            >
              <Share2 className="w-4 h-4 flex-shrink-0" />
              <span>Share</span>
            </TabsTrigger>
            <TabsTrigger
              value="environment"
              className="w-full justify-start gap-3 px-3 py-2.5 data-[state=active]:bg-background"
            >
              <Key className="w-4 h-4 flex-shrink-0" />
              <span>Environment</span>
            </TabsTrigger>
            <TabsTrigger
              value="github"
              className="w-full justify-start gap-3 px-3 py-2.5 data-[state=active]:bg-background"
              disabled={!isGithubIntegrationEnabled}
            >
              <svg
                className="w-4 h-4 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </TabsTrigger>
          </TabsList>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto pr-1">
            {/* Project Details Tab */}
            <TabsContent value="details" className="mt-0 space-y-6">
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-medium mb-2">Project Details</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage your project name and basic information.
                  </p>
                </div>

                {/* Project Name */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Project Name</p>
                  {isEditingName ? (
                    <div className="flex items-center gap-3">
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveName();
                          } else if (e.key === "Escape") {
                            setIsEditingName(false);
                            setEditedName(prototype?.name ?? "");
                          }
                        }}
                        className="h-10 text-sm flex-1"
                        autoFocus
                        disabled={isSavingName}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 hover:bg-emerald-500/20 hover:text-emerald-400"
                        onClick={handleSaveName}
                        disabled={isSavingName}
                      >
                        {isSavingName ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 hover:bg-red-500/20 hover:text-red-400"
                        onClick={() => {
                          setIsEditingName(false);
                          setEditedName(prototype?.name ?? "");
                        }}
                        disabled={isSavingName}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-10 px-3 flex items-center bg-accent border border-border rounded-md">
                        <span className="text-sm">
                          {prototype?.name ?? "Untitled Project"}
                        </span>
                      </div>
                      {canEditName && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-muted-foreground hover:text-foreground"
                          onClick={() => setIsEditingName(true)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Deploy Tab */}
            <TabsContent value="deploy" className="mt-0 space-y-8">
              {/* Deploy Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Rocket className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-medium">Deploy</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Create a production build of your project to share with live
                  users.
                </p>

                {/* Deploy URL */}
                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">
                    URL
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center flex-1 bg-accent border border-border rounded-md">
                      <span className="pl-3 pr-1 text-muted-foreground text-sm">
                        https://
                      </span>
                      <Input
                        value={deploySlug}
                        onChange={(e) => {
                          setDeploySlug(normalizeSlugWhileTyping(e.target.value));
                          setSlugAvailable(null);
                          setSlugError(null);
                        }}
                        className="border-0 bg-transparent text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-9"
                        placeholder="my-app"
                      />
                      <span className="pr-3 pl-1 text-muted-foreground text-sm whitespace-nowrap">
                        .app.nucleate.dev
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyDeployUrl}
                      disabled={!deploySlug}
                      className="h-9 px-3 text-muted-foreground hover:text-foreground"
                    >
                      {deployUrlCopied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
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
                  {slugError && (
                    <p className="text-xs text-amber-400">{slugError}</p>
                  )}
                </div>

                {/* Build History */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">
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
                        create a <strong className="text-foreground">build</strong>{" "}
                        — a snapshot of your app at that moment.
                      </p>
                      <p>
                        When you click{" "}
                        <strong className="text-foreground">
                          Save &amp; deploy
                        </strong>
                        , we publish your latest build so anyone with the link
                        can use it.
                      </p>
                    </div>
                  )}

                  {buildHistory.length === 0 && !isLoadingHistory && (
                    <p className="text-xs text-muted-foreground italic">
                      No builds found for this project
                    </p>
                  )}

                  {buildHistory.length > 0 && (
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {buildHistory.slice(0, 3).map((build, index) => {
                        const isDeployed =
                          build.deploy_key &&
                          prototype?.latest_deploy_key &&
                          build.deploy_key === prototype.latest_deploy_key;
                        const isLatest = index === 0;
                        const buildDate = new Date(build.created_at);

                        return (
                          <div
                            key={build.id}
                            className={cn(
                              "flex items-center justify-between gap-4 p-2 rounded-lg border",
                              isDeployed
                                ? "bg-emerald-950/20 border-emerald-500/30"
                                : "bg-accent border-border",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-xs font-mono text-foreground">
                                {build.id.slice(-8)}
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
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              {buildDate.toLocaleString()}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Deploy Button */}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleDeploy}
                    disabled={Boolean(
                      isDeploying ||
                        isCheckingSlug ||
                        slugAvailable !== true ||
                        slugError ||
                        (!hasSlugChanged && isLatestBuildDeployed),
                    )}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {isDeploying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4 mr-2" />
                        Save &amp; deploy
                      </>
                    )}
                  </Button>
                </div>
              </div>

            </TabsContent>

            {/* Share Tab */}
            <TabsContent value="share" className="mt-0 space-y-6">
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-medium mb-2">Share with prototype view</h3>
                  <p className="text-sm text-muted-foreground">
                    Share your project with others using the prototype view link.
                  </p>
                </div>

                {/* Visibility Toggle */}
                <div className="flex items-center justify-between p-4 bg-accent border border-border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      {isPublic ? (
                        <Globe className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <p className="font-medium text-sm">Make Public</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5 ml-6">
                      {isPublic
                        ? "Anyone with the link can view"
                        : "Only you can view"}
                    </p>
                    {!IsUserPlanSubscribed(userPlan ?? "") && !isPublic && (
                      <p className="text-sm text-amber-500/80 mt-1.5 ml-6">
                        Upgrade to Plus to restrict access
                      </p>
                    )}
                  </div>
                  <label
                    className={cn(
                      "relative inline-flex items-center",
                      !IsUserPlanSubscribed(userPlan ?? "") && !isPublic
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => handleVisibilityToggle(e.target.checked)}
                      disabled={!IsUserPlanSubscribed(userPlan ?? "") && !isPublic}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-indigo-500 peer-disabled:cursor-not-allowed"></div>
                  </label>
                </div>

                {/* Share Link */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Share Link</p>
                  <div className="flex items-center gap-3">
                    <Input
                      value={
                        typeof window !== "undefined"
                          ? window.location.href.replace(
                              "dashboard/projects",
                              "p",
                            )
                          : ""
                      }
                      readOnly
                      className="flex-1 bg-accent border-border text-foreground h-10 text-sm"
                    />
                    <Button
                      onClick={handleCopyLink}
                      disabled={isCopying || hasCopied}
                      className={cn(
                        "flex items-center gap-2 h-10 px-4",
                        hasCopied
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-foreground text-background hover:bg-foreground/90",
                      )}
                    >
                      {isCopying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : hasCopied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {isCopying ? "..." : hasCopied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  {!isPublic && (
                    <p className="text-sm text-amber-500/80">
                      Copying the link will automatically make this project
                      public
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Environment Variables Tab */}
            <TabsContent value="environment" className="mt-0 space-y-6">
              {/* Existing Variables */}
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-base font-medium text-foreground">
                    Existing variables
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={() => void fetchEnvVars()}
                      disabled={isLoadingEnvVars}
                    >
                      <RefreshCw
                        className={cn(
                          "w-3.5 h-3.5 mr-2",
                          isLoadingEnvVars ? "animate-spin" : "",
                        )}
                      />
                      Refresh
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              disabled={!canSyncEnvToDevServer || isSyncingEnvFile}
                              onClick={() => {
                                void refetchEnvVarsOnDevServer();
                              }}
                            >
                              {isSyncingEnvFile ? (
                                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                              )}
                              Sync .env
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canSyncEnvToDevServer
                            ? "Rewrite the .env file in the dev server workspace"
                            : "Start the dev server to sync .env values"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/70 bg-accent/30 px-3 py-2 space-y-2">
                  {isLoadingEnvVars ? (
                    <p className="text-xs text-muted-foreground">
                      Loading environment variables...
                    </p>
                  ) : envVars.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No environment variables yet.
                    </p>
                  ) : (
                    envVars.map((envVar, index) => {
                      const isEditing = editingEnvVars.has(envVar.id ?? "");
                      const isUpdating = updatingEnvVarIds.has(envVar.id ?? "");
                      const isDeleting = deletingEnvVarIds.has(envVar.id ?? "");
                      const canCopyValue = envVar.secret_value !== null;

                      return (
                        <div
                          key={envVar.id ?? `${envVar.name}-${index}`}
                          className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-1">
                              <p className="font-mono text-xs text-foreground break-all">
                                {envVar.is_public && (
                                  <span className="text-muted-foreground">
                                    {envPrefix}
                                  </span>
                                )}
                                {envVar.name}
                              </p>
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    id={`env-var-input-${envVar.id}`}
                                    defaultValue={envVar.secret_value ?? ""}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void handleUpdateEnvVar(
                                          envVar.id ?? "",
                                          e.currentTarget.value,
                                        );
                                      } else if (e.key === "Escape") {
                                        setEditingEnvVars((prev) => {
                                          const updated = new Set(prev);
                                          updated.delete(envVar.id ?? "");
                                          return updated;
                                        });
                                      }
                                    }}
                                    className="h-8 text-xs"
                                    autoFocus
                                    disabled={isUpdating}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                    onClick={() => {
                                      const input = document.getElementById(
                                        `env-var-input-${envVar.id}`,
                                      ) as HTMLInputElement | null;
                                      if (input) {
                                        void handleUpdateEnvVar(
                                          envVar.id ?? "",
                                          input.value,
                                        );
                                      }
                                    }}
                                    disabled={isUpdating}
                                  >
                                    {isUpdating ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-red-500/20 hover:text-red-400 text-red-500/70"
                                    onClick={() => {
                                      setEditingEnvVars((prev) => {
                                        const updated = new Set(prev);
                                        updated.delete(envVar.id ?? "");
                                        return updated;
                                      });
                                    }}
                                    disabled={isUpdating}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ) : envVar.secret_value === null ? (
                                <div className="flex items-center gap-1 text-xs text-amber-500">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Value not set yet</span>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground break-all">
                                  {envVar.secret_value}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  envVar.is_public ? "secondary" : "outline"
                                }
                                className="text-[10px] uppercase tracking-wide"
                              >
                                {envVar.is_public ? "Client" : "Backend"}
                              </Badge>
                              {!isEditing && (
                                <>
                                  {canCopyValue && (
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
                                            onClick={() => {
                                              navigator.clipboard.writeText(
                                                envVar.secret_value ?? "",
                                              );
                                              toast.success(
                                                "Secret value copied",
                                              );
                                            }}
                                            disabled={isDeleting}
                                          >
                                            <Copy className="w-3.5 h-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Copy value</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
                                          onClick={() => {
                                            setEditingEnvVars((prev) =>
                                              new Set(prev).add(envVar.id ?? ""),
                                            );
                                          }}
                                          disabled={isDeleting}
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Edit value</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                              {!isEditing && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                        onClick={() => {
                                          const displayName = envVar.is_public
                                            ? `${envPrefix}${envVar.name}`
                                            : envVar.name;
                                          void handleDeleteEnvVar(
                                            envVar.id ?? "",
                                            displayName ?? "",
                                          );
                                        }}
                                        disabled={isDeleting}
                                      >
                                        {isDeleting ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete variable</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {areEnvSecretsHidden && !isLoadingEnvVars && (
                  <p className="text-[11px] text-muted-foreground">
                    Secret values are redacted because you are not the owner.
                  </p>
                )}
              </div>

              {/* Sync Warning/Error Messages */}
              {envSyncWarning && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-500">{envSyncWarning}</p>
                </div>
              )}
              {envSyncError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-500">{envSyncError}</p>
                </div>
              )}

              {/* Add Environment Variables */}
              <div className="border-t border-border/70 pt-6 space-y-4">
                <p className="text-base font-medium text-foreground">
                  Add environment variables
                </p>

                <div className="space-y-4">
                  {/* Column Headers */}
                  <div className="grid grid-cols-[1fr_1.5fr_120px] gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Name
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Value
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Visibility
                    </p>
                  </div>

                  {/* Environment Variable Inputs */}
                  {newEnvVarInputs.map((input, index) => (
                    <div
                      key={input.id}
                      className="grid grid-cols-[1fr_1.5fr_120px] gap-2 items-start"
                    >
                      <div className="relative">
                        {input.visibility === "client" && (
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono pointer-events-none">
                            {envPrefix}
                          </div>
                        )}
                        <Input
                          value={input.name}
                          onChange={(e) => {
                            const updated = [...newEnvVarInputs];
                            updated[index].name = e.target.value;
                            setNewEnvVarInputs(updated);
                          }}
                          placeholder="API_KEY"
                          className={cn(
                            "h-9 text-sm font-mono",
                            input.visibility === "client" &&
                              (envPrefix === "NEXT_PUBLIC_"
                                ? "pl-[110px]"
                                : "pl-[105px]"),
                          )}
                          disabled={isSavingEnvVar}
                        />
                      </div>

                      <Input
                        value={input.value}
                        onChange={(e) => {
                          const updated = [...newEnvVarInputs];
                          updated[index].value = e.target.value;
                          setNewEnvVarInputs(updated);
                        }}
                        placeholder="Enter value"
                        className="h-9 text-sm"
                        disabled={isSavingEnvVar}
                      />

                      <Select
                        value={input.visibility}
                        onValueChange={(value) => {
                          const updated = [...newEnvVarInputs];
                          updated[index].visibility = value as
                            | "client"
                            | "backend";
                          setNewEnvVarInputs(updated);
                        }}
                        disabled={isSavingEnvVar}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="backend">Backend</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewEnvVarInputs([
                        ...newEnvVarInputs,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          value: "",
                          visibility: "client",
                        },
                      ]);
                    }}
                    disabled={isSavingEnvVar}
                    className="h-8 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    Add another
                  </Button>

                  <p className="text-[11px] text-muted-foreground">
                    Client variables are prefixed with {envPrefix} and exposed
                    in your build. Backend variables stay on the server.
                  </p>
                </div>

                {envVarFormError && (
                  <p className="text-xs text-red-500">{envVarFormError}</p>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      void handleAddEnvVars();
                    }}
                    disabled={isSavingEnvVar || !prototypeId}
                    className="h-9 px-4"
                  >
                    {isSavingEnvVar ? (
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-2" />
                    )}
                    Save variables
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* GitHub Integration Tab */}
            <TabsContent value="github" className="mt-0 space-y-4">
              {!isGithubIntegrationEnabled ? (
                <div className="text-center py-8">
                  <svg
                    className="w-12 h-12 mx-auto text-muted-foreground mb-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">
                    GitHub integration is not enabled
                  </p>
                </div>
              ) : githubIntegration?.loading || githubRepository?.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !githubIntegration?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        GitHub not connected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {canManageGithub
                          ? "Connect GitHub to your team to enable repository features."
                          : "Ask a team admin to connect GitHub to enable repository features."}
                      </p>
                    </div>
                  </div>
                  {canManageGithub && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.open("/dashboard/settings?tab=github", "_blank");
                      }}
                      className="w-full"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Go to Team Settings
                    </Button>
                  )}
                </div>
              ) : githubRepository?.html_url ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <Check className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Repository Connected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your project is synced with GitHub
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        githubRepository.html_url!,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    className="w-full"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Open Repository
                    <ExternalLink className="w-3.5 h-3.5 ml-auto" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-accent border border-border rounded-lg">
                    <svg
                      className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        No repository yet
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create a GitHub repository to sync and version your
                        project code
                      </p>
                    </div>
                  </div>
                  {canManageGithub && (
                    <Button
                      onClick={onCreateGitHubRepository}
                      disabled={githubRepository?.loading}
                      className="w-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {githubRepository?.loading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Create Repository
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
