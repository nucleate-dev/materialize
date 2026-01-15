"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import { HorizontalModeToggle } from "@/components/prototype-editor/horizontal-mode-toggle";
import MaterializeRenderSection, {
  type MaterializeRenderSectionRef,
} from "@/components/prototype-editor/MaterializeRenderSection";
import PublicPrototypeHeader from "@/components/prototype-editor/PublicPrototypeHeader";
import { Button } from "@/components/ui/button";
import type {
  PublicDisplayConfig,
  PublicDisplayConfigScreen,
} from "@/lib/types/prototypes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import { useUserTeams } from "@/hooks/useUserTeams";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  Atom,
  Eye,
  Folder,
  Loader2,
  LogOut,
  Rocket,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  SquareStack,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

// Validate a screen config array
const isValidScreenArray = (arr: unknown): arr is PublicDisplayConfigScreen[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "number" &&
      typeof item.path === "string"
  );
};

// Validate the public display config structure
const isValidPublicDisplayConfig = (config: unknown): config is PublicDisplayConfig => {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;

  // screens is optional, but if present must be valid
  if (c.screens !== undefined && !isValidScreenArray(c.screens)) return false;

  // webScreens is optional, but if present must be valid
  if (c.webScreens !== undefined && !isValidScreenArray(c.webScreens)) return false;

  // previewMode is optional, but if present must be "mobile" or "web"
  if (c.previewMode !== undefined && c.previewMode !== "mobile" && c.previewMode !== "web") return false;

  return true;
};

function AppSidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check initial auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const menuItems = [
    {
      href: "/dashboard/projects",
      icon: Rocket,
      label: "Projects",
      active: pathname?.includes("projects"),
    },
    {
      href: "/dashboard/folders",
      icon: Folder,
      label: "Folders",
      active: pathname?.includes("projects"), // Kept logic as per original
    },
    ...(SHOW_WHITEBOARDS
      ? [
          {
            href: "/dashboard/whiteboards",
            icon: SquareStack,
            label: "Whiteboards",
            active: pathname?.includes("whiteboards"),
          },
        ]
      : []),
  ];

  return (
    <Sidebar className="border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-background">
      <SidebarHeader className="border-b border-gray-200 dark:border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <Link href="/" className="group flex-1 min-w-0">
            <div className="relative flex items-center gap-3 px-3 py-2">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <Atom className="relative w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110 flex-shrink-0" />

              <span className="relative text-xl font-bold text-gray-900 dark:text-foreground transition-transform duration-300 group-hover:scale-105">
                Nucleate
              </span>
            </div>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  size="lg"
                  className="bg-white dark:bg-card border border-gray-200 dark:border-border hover:bg-gray-100 dark:hover:bg-muted text-gray-700 dark:text-white shadow-sm transition-all"
                >
                  <Link href="/">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="font-medium">New chat +</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="px-4 py-2">
          <SidebarSeparator className="bg-gray-200 dark:bg-white/5" />
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    size="lg"
                    className={cn(
                      "text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground transition-colors",
                      item.active &&
                        "bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-medium",
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon
                        className={cn(
                          "w-5 h-5",
                          item.active ? "text-primary" : "opacity-70",
                        )}
                      />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pt-4 border-t border-gray-200 dark:border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <HorizontalModeToggle sidebarExpanded={true} />
          </SidebarMenuItem>
          {isAuthenticated && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname?.includes("account")}
                  size="lg"
                  className="text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground"
                >
                  <Link href="/dashboard/account">
                    <Settings className="w-5 h-5" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={logout}
                  size="lg"
                  className="text-gray-600 dark:text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
          {!isAuthenticated && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground"
              >
                <Link href="/login">
                  <LogOut className="w-5 h-5 rotate-180" />
                  <span>Login</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// Interface matching MobileScreenConfig from MaterializeRenderSection
interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing?: boolean;
}

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatus>("Static build");
  const [isPreviewView, setIsPreviewView] = useState(true);

  // Auth and edit permissions
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { teams: userTeams } = useUserTeams();

  // Public display config state - mobile screens
  const [currentScreens, setCurrentScreens] = useState<MobileScreenConfig[]>(
    [],
  );
  // Public display config state - web screens
  const [currentWebScreens, setCurrentWebScreens] = useState<MobileScreenConfig[]>(
    [],
  );
  const [savedConfig, setSavedConfig] = useState<PublicDisplayConfig | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const renderSectionRef = useRef<MaterializeRenderSectionRef>(null);

  // Check if current user can edit the public display config (owner or team member)
  const canEditPublicConfig = useMemo(() => {
    if (!currentUserId || !prototype) return false;
    const isOwner = currentUserId === prototype.owner_id;
    const isMemberOfTeam = userTeams.some((team) => team.id === prototype.team_id);
    return isOwner || isMemberOfTeam;
  }, [currentUserId, prototype, userTeams]);

  // Helper to check if screens have changed
  const screensChanged = useCallback(
    (current: MobileScreenConfig[], saved: MobileScreenConfig[] | undefined) => {
      const savedScreens = saved ?? [];
      if (savedScreens.length === 0) {
        if (current.length > 1) return true;
        if (current.length === 1 && current[0].path !== "/") return true;
        return false;
      }
      if (current.length !== savedScreens.length) return true;
      for (let i = 0; i < current.length; i++) {
        if (
          current[i].id !== savedScreens[i].id ||
          current[i].path !== savedScreens[i].path
        ) {
          return true;
        }
      }
      return false;
    },
    [],
  );

  // Check if there are unsaved changes (mobile or web)
  const hasUnsavedChanges = useMemo(() => {
    if (!canEditPublicConfig) return false;

    // Check mobile screens
    if (currentScreens.length > 0) {
      if (screensChanged(currentScreens, savedConfig?.screens)) return true;
    }

    // Check web screens
    if (currentWebScreens.length > 0) {
      if (screensChanged(currentWebScreens, savedConfig?.webScreens)) return true;
    }

    return false;
  }, [canEditPublicConfig, currentScreens, currentWebScreens, savedConfig, screensChanged]);

  // Update document title when prototype name is available
  useEffect(() => {
    if (prototype?.name) {
      document.title = `${prototype.name} | Nucleate`;
    }
    return () => {
      document.title = "Nucleate";
    };
  }, [prototype?.name]);

  // Fetch current user
  useEffect(() => {
    async function fetchUserInfo() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      setCurrentUserId(userId);
    }
    fetchUserInfo();
  }, []);

  // Initialize saved config from prototype
  useEffect(() => {
    if (prototype?.public_display_config) {
      const rawConfig = prototype.public_display_config;

      if (isValidPublicDisplayConfig(rawConfig)) {
        logger.debug(
          "log",
          "[PublicPrototypePage] Loading saved public_display_config:",
          { config: rawConfig },
        );
        setSavedConfig(rawConfig);
      } else {
        logger.debug(
          "warn",
          "[PublicPrototypePage] Invalid public_display_config, resetting to default:",
          { config: rawConfig },
        );
        // Reset to default by not setting savedConfig (will use component defaults)
        setSavedConfig(null);
      }
    } else if (prototype) {
      logger.debug(
        "log",
        "[PublicPrototypePage] No public_display_config found on prototype",
      );
    }
  }, [logger, prototype]);

  // Handle screens change from MaterializeRenderSection
  const handleScreensChange = useCallback(
    (screens: MobileScreenConfig[]) => {
      if (canEditPublicConfig) {
        setCurrentScreens(screens);
      }
    },
    [canEditPublicConfig],
  );

  // Handle web screens change from MaterializeRenderSection
  const handleWebScreensChange = useCallback(
    (screens: MobileScreenConfig[]) => {
      if (canEditPublicConfig) {
        setCurrentWebScreens(screens);
      }
    },
    [canEditPublicConfig],
  );

  // Save public display config
  const handleSaveConfig = useCallback(async () => {
    if (!prototypeId || !canEditPublicConfig) return;

    setIsSaving(true);
    try {
      const configToSave: PublicDisplayConfig = {
        screens: currentScreens.map((s) => ({ id: s.id, path: s.path })),
        webScreens: currentWebScreens.map((s) => ({ id: s.id, path: s.path })),
        previewMode: savedConfig?.previewMode ?? "mobile",
      };
      logger.debug(
        "log",
        "[PublicPrototypePage] Saving public_display_config:",
        { configToSave },
      );

      const { error: updateError } = await supabase
        .from("prototypes")
        .update({ public_display_config: configToSave as unknown as Database["public"]["Tables"]["prototypes"]["Update"]["public_display_config"] })
        .eq("id", prototypeId);

      if (updateError) {
        throw updateError;
      }

      setSavedConfig(configToSave);
      toast.success("Public view configuration saved");
    } catch (err) {
      logger.debug("error", "Failed to save public display config:", {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }, [prototypeId, canEditPublicConfig, currentScreens, currentWebScreens, savedConfig?.previewMode, logger]);

  // Discard unsaved changes
  const handleDiscardChanges = useCallback(() => {
    // Reset mobile screens
    if (!savedConfig?.screens?.length) {
      setCurrentScreens([{ id: 0, path: "/" }]);
    } else {
      setCurrentScreens(savedConfig.screens.map((s) => ({ id: s.id, path: s.path })));
    }
    // Reset web screens
    if (!savedConfig?.webScreens?.length) {
      setCurrentWebScreens([{ id: 0, path: "/" }]);
    } else {
      setCurrentWebScreens(savedConfig.webScreens.map((s) => ({ id: s.id, path: s.path })));
    }
    toast.info("Changes discarded");
  }, [savedConfig]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Get initial screens from saved config
  const initialScreens = useMemo((): PublicDisplayConfigScreen[] | undefined => {
    if (savedConfig?.screens?.length) {
      return savedConfig.screens;
    }
    return undefined;
  }, [savedConfig]);

  // Get initial web screens from saved config
  const initialWebScreens = useMemo((): PublicDisplayConfigScreen[] | undefined => {
    if (savedConfig?.webScreens?.length) {
      return savedConfig.webScreens;
    }
    return undefined;
  }, [savedConfig]);

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
        setIsLoading(false);

        // Call fetch-viewing-url API to get viewing URL
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;

          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const fetchViewResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
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
            const fetchViewData: APIResponse<
              FetchViewingUrlSuccessResponse,
              StandardErrorResponse
            > = await fetchViewResponse.json();
            if (fetchViewData.data) {
              setViewingUrl(fetchViewData.data.viewing_url);
            } else if (fetchViewData.error) {
              logger.debug("error", "Error in fetch-viewing-url response:", {
                ...fetchViewData.error,
              });
            }
          } else {
            logger.debug("error", "Failed to fetch viewing URL:", {
              ...fetchViewResponse,
            });
          }
        } catch (fetchViewError) {
          logger.debug("error", "Error calling fetch-viewing-url API:", {
            message:
              fetchViewError instanceof Error
                ? fetchViewError.message
                : String(fetchViewError),
            stack:
              fetchViewError instanceof Error
                ? fetchViewError.stack
                : undefined,
          });
        }
      } catch (err) {
        logger.debug("error", "Error fetching project data:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrototypeData();
  }, [prototypeId, logger]);

  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-white dark:bg-background">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-card border-gray-200 dark:border-border shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100 dark:border-red-500/20">
              <Sparkles className="w-8 h-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Couldn&apos;t Load Project
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-muted-foreground mt-2">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-card border-gray-200 dark:border-border shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-200 dark:border-border">
              <Eye className="w-8 h-8 text-gray-400 dark:text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Prototype Not Found
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-muted-foreground mt-2">
              The prototype you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to view it.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex w-full h-screen bg-white dark:bg-background">
        <AppSidebar />
        <main className="flex flex-1 flex-col h-screen overflow-hidden bg-white dark:bg-background">
          {/* Header with Sidebar Trigger */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-white/[0.02]">
            <SidebarTrigger className="text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted" />
            <div className="flex-1">
              <PublicPrototypeHeader
                prototype={prototype}
                onUpdatePrototype={handleUpdatePrototype}
              />
            </div>
          </div>

          {/* Main Content - ExpoSnackViewer */}
          <div className="flex-1 relative">
            <MaterializeRenderSection
              ref={renderSectionRef}
              viewing_url={viewingUrl ?? ""}
              prototypeId={prototypeId}
              currentRenderStatus={renderStatus}
              onRenderStatusChange={setRenderStatus}
              isPreviewView={isPreviewView}
              onPreviewViewChange={setIsPreviewView}
              publicView={true}
              framework={prototype?.framework ?? undefined}
              initialScreens={initialScreens}
              onScreensChange={
                canEditPublicConfig ? handleScreensChange : undefined
              }
              initialWebScreens={initialWebScreens}
              onWebScreensChange={
                canEditPublicConfig ? handleWebScreensChange : undefined
              }
              codeView={
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-muted-foreground bg-gray-50 dark:bg-background">
                  Code view is unavailable in the public prototype viewer.
                </div>
              }
            />

            {/* Floating Save/Discard Buttons */}
            {hasUnsavedChanges && canEditPublicConfig && (
              <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDiscardChanges}
                    variant="outline"
                    className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 shadow-lg px-3 py-2 rounded-lg flex items-center gap-2"
                    aria-label="Discard unsaved changes to public view configuration"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Discard</span>
                  </Button>
                  <Button
                    onClick={handleSaveConfig}
                    disabled={isSaving}
                    className="bg-primary hover:bg-primary/90 text-white shadow-lg px-4 py-2 rounded-lg flex items-center gap-2"
                    aria-label="Save public view configuration so visitors see this layout"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Save public layout</span>
                    <span className="sm:hidden">Save</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
