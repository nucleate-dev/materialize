"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  APIResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

interface EnvironmentVariablesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prototypeId?: string;
  sandbox_url?: string | null;
  framework?: string;
}

export function EnvironmentVariablesModal({
  isOpen,
  onOpenChange,
  prototypeId,
  sandbox_url,
  framework,
}: EnvironmentVariablesModalProps) {
  const logger = useProductLogger();

  // Determine the appropriate environment variable prefix based on framework
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
        logger.debug("error", "Failed to fetch environment variables", {
          error: error.message,
          prototypeId,
        });
        toast.error("Unable to load environment variables");
        return;
      }

      // Transform the data to strip env prefix for display
      const transformedData: PrototypeEnvVar[] = (data ?? []).map((envVar) => {
        // Supabase join returns an array for related tables
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

        // Strip the prefix if it exists
        if (displayName.startsWith(envPrefix)) {
          displayName = displayName.substring(envPrefix.length);
        }

        // Handle case where prefix was doubled (e.g., NEXT_PUBLIC_NEXT_PUBLIC_)
        // This can happen if user typed the prefix when creating the variable
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
    } catch (error) {
      logger.debug("error", "Error fetching environment variables", {
        error: error instanceof Error ? error.message : String(error),
        prototypeId,
      });
      toast.error("Unable to load environment variables");
    } finally {
      setIsLoadingEnvVars(false);
    }
  }, [prototypeId, logger, envPrefix]);

  useEffect(() => {
    if (isOpen) {
      void fetchEnvVars();
    }
  }, [isOpen, fetchEnvVars]);

  const handleDialogChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
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

  const refetchEnvVarsOnDevServer = useCallback(
    async (_source: "manual" | "auto" = "auto"): Promise<boolean> => {
      // Clear previous sync messages
      setEnvSyncWarning(null);
      setEnvSyncError(null);

      if (!sandbox_url || !prototypeId) {
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

        const response = await fetch(`${sandbox_url}/dev-server/refetch-env`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prototype_id: prototypeId }),
        });

        const result: APIResponse<
          { env_var_count: number; message: string },
          StandardErrorResponse
        > = await response.json().catch(() => ({ data: null, error: null }));

        if (!response.ok || result.error) {
          const message =
            result.error?.message ?? "Failed to refresh dev server env vars";
          throw new Error(message);
        }

        toast.success("Dev server environment updated");
        return true;
      } catch (error) {
        logger.debug("error", "Failed to refresh dev server env vars", {
          error: error instanceof Error ? error.message : String(error),
          sandbox_url,
        });
        toast.error("Unable to refresh dev server env vars");
        setEnvSyncError(
          "Error syncing to development server. Try again later.",
        );
        return false;
      } finally {
        setIsSyncingEnvFile(false);
      }
    },
    [sandbox_url, prototypeId, logger],
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
          logger.debug("error", "Failed to update env var", {
            error: error instanceof Error ? error.message : String(error),
            envVarId,
          });
          throw new Error(error.message);
        }

        // Update local state
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
        logger.log({
          event: "client_prototype_editor_env_var_updated",
          properties: {
            prototype_id: prototypeId,
            env_var_id: envVarId,
          },
        });

        if (sandbox_url) {
          await refetchEnvVarsOnDevServer("auto");
        }
      } catch (error) {
        logger.debug("error", "Failed to update environment variable", {
          error: error instanceof Error ? error.message : String(error),
          envVarId,
        });
        if (
          error instanceof Error &&
          !error.message.includes("prototype_env_vars") &&
          !error.message.includes("prototype_env_var_secrets")
        ) {
          toast.error("Unable to update environment variable");
        }
      } finally {
        setUpdatingEnvVarIds((prev) => {
          const updated = new Set(prev);
          updated.delete(envVarId);
          return updated;
        });
      }
    },
    [prototypeId, sandbox_url, logger, refetchEnvVarsOnDevServer],
  );

  const handleDeleteEnvVar = useCallback(
    async (envVarId: string, envVarName: string) => {
      if (!prototypeId) {
        toast.error("Prototype is still initializing");
        return;
      }

      // Confirm deletion
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

        // Update local state
        setEnvVars((prev) => prev.filter((envVar) => envVar.id !== envVarId));

        toast.success("Environment variable deleted");
        logger.log({
          event: "client_prototype_editor_env_var_deleted",
          properties: {
            prototype_id: prototypeId,
            env_var_id: envVarId,
          },
        });

        if (sandbox_url) {
          await refetchEnvVarsOnDevServer("auto");
        }
      } catch (error) {
        logger.debug("error", "Failed to delete environment variable", {
          error: error instanceof Error ? error.message : String(error),
          envVarId,
        });
        if (
          error instanceof Error &&
          !error.message.includes("prototype_env_vars")
        ) {
          toast.error("Unable to delete environment variable");
        }
      } finally {
        setDeletingEnvVarIds((prev) => {
          const updated = new Set(prev);
          updated.delete(envVarId);
          return updated;
        });
      }
    },
    [prototypeId, sandbox_url, logger, refetchEnvVarsOnDevServer],
  );

  const handleAddEnvVars = useCallback(async () => {
    if (!prototypeId) {
      setEnvVarFormError("Prototype is still initializing");
      return;
    }

    // Filter out empty inputs
    const validInputs = newEnvVarInputs.filter(
      (input) => input.name.trim() || input.value.trim(),
    );

    if (validInputs.length === 0) {
      setEnvVarFormError("At least one environment variable is required");
      return;
    }

    // Validate each input
    for (const input of validInputs) {
      let normalizedName = normalizeEnvVarNameInput(input.name);
      if (!normalizedName) {
        setEnvVarFormError(
          `Environment variable name is required for all entries`,
        );
        return;
      }

      // Strip any existing prefix if user included it
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

      // Check for duplicates with existing environment variables
      const finalName =
        input.visibility === "client"
          ? `${envPrefix}${normalizedName}`
          : normalizedName;

      // Get the original names from the database (before stripping the prefix for display)
      // In fetchEnvVars, we strip the env prefix from all names for display
      // So we need to reconstruct the original database name
      const existingNames = envVars.map((envVar) => {
        // If it's a public variable, the original name in DB has the env prefix
        if (envVar.is_public) {
          return `${envPrefix}${envVar.name}`;
        }
        return envVar.name;
      });

      if (existingNames.includes(finalName)) {
        setEnvVarFormError(
          `Environment variable "${input.visibility === "client" ? `${envPrefix}${normalizedName}` : normalizedName}" already exists. Please edit the existing variable instead.`,
        );
        return;
      }
    }

    setIsSavingEnvVar(true);
    setEnvVarFormError(null);
    try {
      // Prepare all environment variables for insertion
      const envVarSecrets = new Map<string, string>();
      const envVarsToInsert = validInputs.map((input) => {
        let normalizedName = normalizeEnvVarNameInput(input.name);

        // Strip any existing prefix if user included it
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
      logger.log({
        event: "client_prototype_editor_env_var_added",
        properties: {
          prototype_id: prototypeId,
          count: validInputs.length,
        },
      });

      if (sandbox_url) {
        await refetchEnvVarsOnDevServer("auto");
      }
    } catch (error) {
      logger.debug("error", "Failed to add environment variables", {
        error: error instanceof Error ? error.message : String(error),
        prototypeId,
      });
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
    sandbox_url,
    logger,
    refetchEnvVarsOnDevServer,
    envPrefix,
  ]);

  const canSyncEnvToDevServer = Boolean(sandbox_url && prototypeId);
  const areEnvSecretsHidden =
    envVars.length > 0 && envVars.every((envVar) => !envVar.secret_value);

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-2xl bg-accent border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Environment Variables
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Securely manage values for this prototype. Secrets are only visible
            to the owner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-foreground">
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
                            void refetchEnvVarsOnDevServer("manual");
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
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border/70 bg-background/70 px-3 py-2 space-y-2">
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
                      className="flex flex-col gap-2 rounded-md border border-border bg-accent/40 p-3"
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
                                    const value = e.currentTarget.value;
                                    void handleUpdateEnvVar(
                                      envVar.id ?? "",
                                      value,
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
                            variant={envVar.is_public ? "secondary" : "outline"}
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
                                          toast.success("Secret value copied");
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

          <div className="border-t border-border/70 pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Add environment variables
            </p>

            <div className="space-y-3">
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
                  {/* Name Input with Prefix */}
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

                  {/* Value Input */}
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

                  {/* Visibility Select */}
                  <Select
                    value={input.visibility}
                    onValueChange={(value) => {
                      const updated = [...newEnvVarInputs];
                      updated[index].visibility = value as "client" | "backend";
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

              {/* Add More Button */}
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
                Client variables are prefixed with {envPrefix} and exposed in
                your build. Backend variables stay on the server.
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
