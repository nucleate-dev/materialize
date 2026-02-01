"use client";

import { supabase } from "@/ClientConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  StandardErrorResponse,
  SupabaseProjectSummary,
  SupabaseProjectsSuccessResponse,
  SupabaseIntegrationsSuccessResponse,
  SupabaseCreateProjectSuccessResponse,
} from "@/lib/types/serverAPITypes";
import type {
  PublicDevServerAddBackendRequest,
  PublicDevServerAddBackendSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse as SandboxStandardErrorResponse,
} from "@/lib/types/SandboxAPITypes";
import { Cloud, ExternalLink, Loader2, Plus } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface CloudIntegrationsDropdownProps {
  prototypeId?: string;
  normalizedSandboxUrl?: string | null;
  onOpenTeamSettings?: (tab: "supabase-backend") => void;
}

export function CloudIntegrationsDropdown({
  prototypeId,
  normalizedSandboxUrl,
  onOpenTeamSettings,
}: CloudIntegrationsDropdownProps) {
  const logger = useProductLogger();
  const posthog = usePostHog();
  const { activeTeam, currentUserMembership } = useActiveTeam();

  // Check if supabase-backend-connector feature flag is enabled
  const isSupabaseBackendConnectorEnabled =
    posthog?.isFeatureEnabled("supabase-backend-connector") ?? false;

  // Supabase integration state (team has connected Supabase)
  const [supabaseIntegration, setSupabaseIntegration] = useState<{
    connected: boolean;
    loading: boolean;
  }>({ connected: false, loading: true });

  // Supabase backend state for this prototype
  const [supabaseBackend, setSupabaseBackend] = useState<{
    projectUrl: string | null;
    loading: boolean;
  }>({ projectUrl: null, loading: true });

  // Available Supabase projects for linking
  const [supabaseProjects, setSupabaseProjects] = useState<{
    projects: SupabaseProjectSummary[];
    loading: boolean;
  }>({ projects: [], loading: false });

  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLinkingProject, setIsLinkingProject] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const buildProjectName = useCallback(() => {
    const base = prototypeId ? `nucleate-${prototypeId}` : "nucleate-project";
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    const trimmed = normalized.slice(0, 40);
    return trimmed.length > 0 ? trimmed : "nucleate-project";
  }, [prototypeId]);

  const addBackendToSandbox = useCallback(
    async (
      project: SupabaseProjectSummary,
      accessToken: string,
    ): Promise<PublicDevServerAddBackendSuccessResponse["backend"] | null> => {
      if (!normalizedSandboxUrl) {
        const message =
          "Dev server not started yet. Start the server, then try linking again.";
        setError(message);
        toast.error(message);
        return null;
      }

      const payload: PublicDevServerAddBackendRequest = {
        type: "supabase",
        project_id: project.id,
        project_url: `https://supabase.com/dashboard/project/${project.id}`,
        metadata: {
          name: project.name,
          region: project.region,
          organization_id: project.organization_id,
        },
      };

      const response = await fetch(
        `${normalizedSandboxUrl}/dev-server/add-backend`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result: SandboxAPIResponse<
        PublicDevServerAddBackendSuccessResponse,
        SandboxStandardErrorResponse
      > = await response.json().catch(() => ({
        data: null,
        error: {
          error: "Invalid response",
          message: "Failed to parse dev server response",
        },
      }));

      if (!response.ok || result.error || !result.data) {
        const message =
          result.error?.message ?? "Failed to link Supabase project";
        setError(message);
        toast.error(message);
        return null;
      }

      return result.data.backend;
    },
    [normalizedSandboxUrl],
  );

  // Fetch Supabase integration status for the active team
  useEffect(() => {
    const fetchSupabaseIntegration = async () => {
      if (!activeTeam?.id || !isSupabaseBackendConnectorEnabled) {
        setSupabaseIntegration({ connected: false, loading: false });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("connectors_supabase_integrations")
          .select("id, status")
          .eq("team_id", activeTeam.id)
          .eq("status", "active")
          .maybeSingle();

        if (error) {
          logger.debug("error", "Failed to fetch Supabase integration", {
            error,
          });
          setSupabaseIntegration({ connected: false, loading: false });
          return;
        }

        const isConnected = !!data;
        setSupabaseIntegration({ connected: isConnected, loading: false });
      } catch (error) {
        logger.debug("error", "Error checking Supabase integration", { error });
        setSupabaseIntegration({ connected: false, loading: false });
      }
    };

    fetchSupabaseIntegration();
  }, [activeTeam?.id, isSupabaseBackendConnectorEnabled, logger]);

  // Fetch Supabase backend for this prototype
  useEffect(() => {
    const fetchSupabaseBackend = async () => {
      if (!prototypeId || !isSupabaseBackendConnectorEnabled) {
        setSupabaseBackend({ projectUrl: null, loading: false });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("prototype_backends")
          .select("provider_project_url")
          .eq("prototype_id", prototypeId)
          .eq("backend_type", "supabase")
          .maybeSingle();

        if (error) {
          logger.debug("error", "Failed to fetch Supabase backend", {
            error,
          });
          setSupabaseBackend({ projectUrl: null, loading: false });
          return;
        }

        setSupabaseBackend({
          projectUrl: data?.provider_project_url ?? null,
          loading: false,
        });
      } catch (error) {
        logger.debug("error", "Error checking Supabase backend", { error });
        setSupabaseBackend({ projectUrl: null, loading: false });
      }
    };

    fetchSupabaseBackend();
  }, [prototypeId, isSupabaseBackendConnectorEnabled, logger]);

  // Fetch Supabase projects when dropdown is opened and integration is connected but no backend
  useEffect(() => {
    const fetchSupabaseProjects = async () => {
      if (
        !isOpen ||
        !activeTeam?.id ||
        !supabaseIntegration.connected ||
        supabaseBackend.projectUrl
      ) {
        return;
      }

      setSupabaseProjects({ projects: [], loading: true });

      try {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;

        if (!accessToken) {
          setSupabaseProjects({ projects: [], loading: false });
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/connectors/supabase/projects?teamId=${activeTeam.id}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch Supabase projects");
        }

        const result: APIResponse<
          SupabaseProjectsSuccessResponse,
          StandardErrorResponse
        > = await response.json();

        if (result.data) {
          setSupabaseProjects({
            projects: result.data.projects,
            loading: false,
          });
        } else {
          throw new Error(result.error?.message || "Failed to fetch projects");
        }
      } catch (error) {
        logger.debug("error", "Error fetching Supabase projects", {
          error: error instanceof Error ? error.message : String(error),
        });
        setSupabaseProjects({ projects: [], loading: false });
      }
    };

    fetchSupabaseProjects();
  }, [
    isOpen,
    activeTeam?.id,
    supabaseIntegration.connected,
    supabaseBackend.projectUrl,
    logger,
  ]);

  // Handle linking a Supabase project to this prototype
  const handleLinkSupabaseProject = useCallback(
    async (project: SupabaseProjectSummary) => {
      if (!prototypeId || !activeTeam?.id) return;

      setIsLinkingProject(project.id);
      setError(null);

      try {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;

        if (!accessToken) {
          throw new Error("Not authenticated");
        }

        const backend = await addBackendToSandbox(project, accessToken);
        if (!backend) {
          return;
        }

        // Update state to reflect the linked backend
        setSupabaseBackend({
          projectUrl: backend.project_url ??
            `https://supabase.com/dashboard/project/${project.id}`,
          loading: false,
        });

        toast.success("Supabase project linked successfully!");
        setIsOpen(false);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to link project";
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLinkingProject(null);
      }
    },
    [prototypeId, activeTeam?.id, addBackendToSandbox],
  );

  const handleCreateSupabaseProject = useCallback(async () => {
    if (!prototypeId || !activeTeam?.id) return;
    if (!normalizedSandboxUrl) {
      const message =
        "Dev server not started yet. Start the server, then try creating a project.";
      setError(message);
      toast.error(message);
      return;
    }

    setIsCreatingProject(true);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      let organizationId = supabaseProjects.projects[0]?.organization_id ?? null;
      let region = supabaseProjects.projects[0]?.region ?? "us-east-1";

      if (!organizationId) {
        const integrationResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/connectors/supabase/integrations?teamId=${activeTeam.id}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const integrationResult: APIResponse<
          SupabaseIntegrationsSuccessResponse,
          StandardErrorResponse
        > = await integrationResponse.json();

        if (!integrationResponse.ok || integrationResult.error) {
          throw new Error(
            integrationResult.error?.message ??
              "Failed to load Supabase integration",
          );
        }

        organizationId =
          integrationResult.data.integrations[0]?.supabase_organization_id ??
          null;
      }

      if (!organizationId) {
        throw new Error(
          "No Supabase organization connected. Reconnect in team settings.",
        );
      }

      const createResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/connectors/supabase/create-project`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            teamId: activeTeam.id,
            organizationId,
            name: buildProjectName(),
            region,
          }),
        },
      );

      const createResult: APIResponse<
        SupabaseCreateProjectSuccessResponse,
        StandardErrorResponse
      > = await createResponse.json();

      if (!createResponse.ok || createResult.error || !createResult.data) {
        const message =
          createResult.error?.message ?? "Failed to create Supabase project";
        setError(message);
        toast.error(message);
        return;
      }

      const createdProject = createResult.data.project;

      const backend = await addBackendToSandbox(createdProject, accessToken);
      if (!backend) {
        return;
      }

      setSupabaseBackend({
        projectUrl: backend.project_url ??
          `https://supabase.com/dashboard/project/${createdProject.id}`,
        loading: false,
      });

      setSupabaseProjects((prev) => ({
        ...prev,
        projects: [createdProject, ...prev.projects],
      }));

      toast.success("Supabase project created and linked!");
      setIsOpen(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create project";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsCreatingProject(false);
    }
  }, [
    prototypeId,
    activeTeam?.id,
    normalizedSandboxUrl,
    supabaseProjects.projects,
    addBackendToSandbox,
    buildProjectName,
  ]);

  // Don't render if feature flag is disabled
  if (!isSupabaseBackendConnectorEnabled) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                disabled={!prototypeId}
              >
                <Cloud className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Cloud integrations</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        align="end"
        className="w-80 bg-accent border-border text-foreground p-4"
      >
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Supabase Backend
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connect your Supabase project to enable backend integrations.
          </p>

          {error && (
            <Alert className="border-rose-500/20 bg-rose-500/10">
              <AlertDescription className="text-xs text-rose-600 dark:text-rose-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Case 1: No Supabase integration connected */}
          {!supabaseIntegration.loading && !supabaseIntegration.connected && (
            <>
              {currentUserMembership?.role === "viewer" && (
                <Alert className="border-warning/30 bg-warning/10">
                  <AlertDescription className="text-xs text-foreground">
                    Please reach out to a team admin to connect Supabase first.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                className="w-full bg-white text-black hover:bg-white/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                size="sm"
                disabled={currentUserMembership?.role === "viewer"}
                onClick={() => {
                  if (onOpenTeamSettings) {
                    onOpenTeamSettings("supabase-backend");
                    setIsOpen(false);
                  }
                }}
              >
                <Cloud className="w-4 h-4 mr-2" />
                Connect Supabase
              </Button>
            </>
          )}

          {/* Case 2: Supabase connected but no backend linked to this prototype */}
          {!supabaseIntegration.loading &&
            supabaseIntegration.connected &&
            !supabaseBackend.loading &&
            !supabaseBackend.projectUrl && (
              <>
                {currentUserMembership?.role === "viewer" && (
                  <Alert className="border-warning/30 bg-warning/10">
                    <AlertDescription className="text-xs text-foreground">
                      You need edit permissions to link a Supabase project.
                    </AlertDescription>
                  </Alert>
                )}

                {supabaseProjects.loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : supabaseProjects.projects.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Select a project to link:
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {supabaseProjects.projects.map((project) => (
                        <Button
                          key={project.id}
                          variant="ghost"
                          className="w-full justify-start text-left h-auto py-2 px-3 hover:bg-background/50"
                          disabled={
                            currentUserMembership?.role === "viewer" ||
                            isLinkingProject === project.id
                          }
                          onClick={() => handleLinkSupabaseProject(project)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            {isLinkingProject === project.id ? (
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            ) : (
                              <Cloud className="w-4 h-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {project.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {project.region}
                              </p>
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                    <DropdownMenuSeparator className="bg-border" />
                  </div>
                ) : (
                  <Alert className="border-blue-500/20 bg-blue-500/10">
                    <AlertDescription className="text-xs text-blue-600 dark:text-blue-400">
                      No Supabase projects found. Create one in your Supabase
                      dashboard.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="outline"
                  className="w-full border-border text-foreground hover:bg-background/50"
                  size="sm"
                  disabled={
                    currentUserMembership?.role === "viewer" ||
                    isCreatingProject
                  }
                  onClick={handleCreateSupabaseProject}
                >
                  {isCreatingProject ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  {isCreatingProject ? "Creating Supabase..." : "Create New Supabase"}
                </Button>
              </>
            )}

          {/* Case 3: Supabase backend linked to this prototype */}
          {!supabaseBackend.loading && supabaseBackend.projectUrl && (
            <>
              <Alert className="border-success/30 bg-success/10">
                <AlertDescription className="text-xs text-success">
                  Supabase project linked to this prototype.
                </AlertDescription>
              </Alert>
              <Button
                className="w-full bg-white text-black hover:bg-white/90 font-medium"
                size="sm"
                onClick={() => {
                  if (supabaseBackend.projectUrl) {
                    window.open(
                      supabaseBackend.projectUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    setIsOpen(false);
                  }
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Supabase Project
              </Button>
            </>
          )}

          {/* Loading state */}
          {(supabaseIntegration.loading || supabaseBackend.loading) && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
