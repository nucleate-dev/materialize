"use client";

import { supabase } from "@/ClientConstants";
import { ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { type ScreenUpdateData } from "@/lib/types/ChatTypes";
import { PublicDisplayConfigScreen } from "@/lib/types/prototypes";
import type {
  APIResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { getBulkAssetSignedUrls } from "@/lib/utils/assetUtils";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import JSZip from "jszip";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type { PostHogEvent } from "@/lib/loggers/PostHogEvents";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Hammer,
  LayoutGrid,
  Lightbulb,
  Loader2,
  MessageSquare,
  Monitor,
  MoreVertical,
  Move,
  Palette,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCcw,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal as TerminalIcon,
  Type,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import React, {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { TerminalProps, TerminalSession } from "./Terminal";

// Dynamically import Terminal to avoid SSR issues with xterm
const Terminal = dynamic<TerminalProps>(() => import("./Terminal"), {
  ssr: false,
});

// Import the Project Settings Modal (unified modal)
import {
  ProjectSettingsModal,
  type ProjectSettingsTab,
} from "./ProjectSettingsModal";
// Import the View on Device Modal
import {
  BuildAndDeployResponse,
  HTTP_STATUS,
  PublicDevServerRestartSuccessResponse,
} from "@/lib/types/SandboxAPITypes";
import { CloudIntegrationsDropdown } from "./CloudIntegrationsDropdown";
import { ViewOnDeviceModal } from "./ViewOnDeviceModal";

// Import PreviewCanvas for infinite canvas mode
import type {
  AIActionType,
  CanvasStateData,
  GlobalAIAction,
  PreviewCanvasRef,
} from "./canvas";
import { PreviewCanvas } from "./canvas";

export interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing?: boolean; // Track if the badge is in edit mode
}

const normalizePath = (value: string) => {
  if (!value) {
    return "/";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "/";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return normalized || "/";
    } catch {
      return "/";
    }
  }

  if (trimmed.startsWith("?") || trimmed.startsWith("#")) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const stripTokenFromPath = (path: string) => {
  if (!path) return path;

  try {
    const parsed = new URL(path, "http://local");
    if (!parsed.searchParams.has("token")) {
      return path;
    }

    parsed.searchParams.delete("token");
    const search = parsed.searchParams.toString();
    return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
  } catch {
    return path;
  }
};

const stripTokenFromUrl = (url: string) => {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("token")) {
      return url;
    }

    parsed.searchParams.delete("token");
    const search = parsed.searchParams.toString();
    return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
  } catch {
    return url;
  }
};

const extractInitialPath = (url: string) => {
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return normalized || "/";
  } catch {
    return "/";
  }
};

const resolveIframeSrc = (baseUrl: string, path: string) => {
  if (!baseUrl) {
    return "";
  }

  try {
    const base = new URL(baseUrl);
    const token = base.searchParams.get("token");
    const resolved = new URL(path || "/", base);
    if (token && !resolved.searchParams.has("token")) {
      resolved.searchParams.set("token", token);
    }
    return resolved.toString();
  } catch {
    try {
      return new URL(baseUrl).toString();
    } catch {
      return baseUrl;
    }
  }
};

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

interface MaterializeRenderSectionProps {
  viewing_url: string; // ASSUMPTION: viewing_url is always normalized with protocol (e.g., https://)
  base_tunnel_url?: string | null; // WebSocket URL for terminal connection
  sandbox_url?: string | null; // Normalized HTTPS URL for sandbox API calls
  onResetToDefault?: () => void;
  // Props for dev server functionality
  prototypeId?: string;
  files?: Record<string, PrototypeFile>;
  assets?: Record<string, PrototypeAsset>;
  // New render status props
  currentRenderStatus?: RenderStatus;
  onRenderStatusChange: (status: RenderStatus) => void;
  // Design system props
  designSystemLabel?: string;
  onDesignSystemClick?: () => void;
  // Current viewing path callback
  onCurrentPathChange?: (path: string) => void;
  // View switching props
  isPreviewView: boolean;
  onPreviewViewChange: (isPreview: boolean) => void;
  codeView: ReactNode;
  mobileHint?: string;
  isMobileLayout?: boolean;
  // Clone action
  onClone?: () => void;
  isCloningPrototype?: boolean;
  // Project settings modal props
  prototype?: Database["public"]["Tables"]["prototypes"]["Row"] | null;
  isPublic?: boolean;
  onVisibilityChange?: (
    visibility: import("@/lib/types/prototypes").PrototypeVisibility,
  ) => void;
  userPlan?: string | null;
  onNameChange?: (name: string) => void;
  canEditName?: boolean;
  onDeploySuccess?: (result: {
    slug: string;
    url: string;
    visibility: import("@/lib/types/prototypes").PrototypeVisibility;
  }) => void;
  canManageGithub?: boolean;
  // Public view mode - hides preview/code switch, status badge, and terminal
  publicView?: boolean;
  // Deployment
  deploymentUrl?: string | null;
  isDeploying?: boolean;
  deployedView?: boolean;
  // Framework type to determine default preview mode
  framework?: string;
  // Callback to start dev server (consolidated in parent)
  onStartDevServer?: () => void;
  // Public display config - for configuring multi-screen layouts
  initialScreens?: PublicDisplayConfigScreen[];
  onScreensChange?: (screens: MobileScreenConfig[]) => void;
  // Web multi-screen config
  initialWebScreens?: PublicDisplayConfigScreen[];
  onWebScreensChange?: (screens: MobileScreenConfig[]) => void;
  // Preview mode change callback
  onPreviewModeChange?: (mode: "mobile" | "web" | "tablet") => void;
  // Canvas mode props (infinite canvas like Figma)
  initialCanvasState?: CanvasStateData;
  onCanvasStateChange?: (state: CanvasStateData) => void;
  // Chat panel collapse state
  isChatCollapsed?: boolean;
  onExpandChat?: () => void;
  // Allows consumers to hide the toolbar (e.g., readonly public viewers)
  showToolbar?: boolean;
  // Screen AI action callback - sends AI action requests to parent (e.g., chat panel)
  onScreenAIAction?: (
    screenId: number,
    path: string,
    action: AIActionType,
    screenshotDataUrl?: string,
  ) => void;
  // Global AI action callback - canvas-wide actions like PRD generation
  onGlobalAIAction?: (
    action: GlobalAIAction,
    screenshotDataUrls?: string[],
  ) => void;
  // Callback to open team settings dialog (for Supabase integration)
  onOpenTeamSettings?: (tab: "supabase-backend") => void;
}

export interface MaterializeRenderSectionRef {
  forceRefresh: () => void;
  updateScreens: (data: ScreenUpdateData) => void;
  openProjectSettings: (tab?: ProjectSettingsTab) => void;
}

type PreviewMode = "web" | "mobile" | "tablet";

const MaterializeRenderSection = forwardRef<
  MaterializeRenderSectionRef,
  MaterializeRenderSectionProps
>(
  (
    {
      viewing_url,
      base_tunnel_url,
      sandbox_url,
      onResetToDefault,
      prototypeId,
      files,
      assets,
      currentRenderStatus = "Static build",
      onRenderStatusChange,
      designSystemLabel,
      onDesignSystemClick,
      onCurrentPathChange,
      isPreviewView,
      onPreviewViewChange,
      codeView,
      mobileHint,
      isMobileLayout,
      onClone,
      isCloningPrototype = false,
      prototype,
      isPublic = false,
      onVisibilityChange,
      onNameChange,
      canEditName = false,
      onDeploySuccess,
      canManageGithub = false,
      deploymentUrl,
      isDeploying = false,
      deployedView = false,
      publicView = false,
      framework,
      onStartDevServer,
      initialScreens,
      onScreensChange,
      initialWebScreens,
      onWebScreensChange,
      onPreviewModeChange,
      initialCanvasState,
      onCanvasStateChange,
      isChatCollapsed = false,
      onExpandChat,
      showToolbar = true,
      onScreenAIAction,
      onGlobalAIAction,
      onOpenTeamSettings,
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();
    const posthog = usePostHog();
    const { activeTeam, currentUserMembership } = useActiveTeam();

    // GitHub integration state
    const [githubIntegration, setGithubIntegration] = useState<{
      connected: boolean;
      loading: boolean;
    }>({ connected: false, loading: true });

    // GitHub repository state for this prototype
    const [githubRepository, setGithubRepository] = useState<{
      html_url: string | null;
      loading: boolean;
    }>({ html_url: null, loading: true });
    const [githubRepoError, setGithubRepoError] = useState<string | null>(null);

    // Fetch GitHub integration status for the active team
    useEffect(() => {
      const fetchGithubIntegration = async () => {
        if (!activeTeam?.id) {
          setGithubIntegration({ connected: false, loading: false });
          return;
        }

        try {
          const { data, error } = await supabase
            .from("github_integrations")
            .select("installation_id, is_suspended")
            .eq("team_id", activeTeam.id)
            .maybeSingle();

          if (error) {
            logger.debug("error", "Failed to fetch GitHub integration", {
              error,
            });
            setGithubIntegration({ connected: false, loading: false });
            return;
          }

          // Integration is connected if it exists and is not suspended
          const isConnected = !!data && !data.is_suspended;
          setGithubIntegration({ connected: isConnected, loading: false });
        } catch (error) {
          logger.debug("error", "Error checking GitHub integration", { error });
          setGithubIntegration({ connected: false, loading: false });
        }
      };

      fetchGithubIntegration();
    }, [activeTeam?.id, logger]);

    // Fetch GitHub repository for this prototype
    useEffect(() => {
      const fetchGithubRepository = async () => {
        if (!prototypeId) {
          setGithubRepository({ html_url: null, loading: false });
          return;
        }

        try {
          const { data, error } = await supabase
            .from("prototype_github_repositories")
            .select("github_repo_id, team_id, github_repositories(html_url)")
            .eq("prototype_id", prototypeId)
            .maybeSingle();

          if (error) {
            logger.debug("error", "Failed to fetch GitHub repository", {
              error,
            });
            setGithubRepository({ html_url: null, loading: false });
            return;
          }

          const repoUrl = data?.github_repositories?.html_url;
          setGithubRepository({
            html_url: repoUrl ?? null,
            loading: false,
          });
        } catch (error) {
          logger.debug("error", "Error checking GitHub repository", { error });
          setGithubRepository({ html_url: null, loading: false });
        }
      };

      fetchGithubRepository();
    }, [prototypeId, logger]);

    // Check if canvas preview mode is enabled (infinite canvas like Figma)
    const isCanvasPreviewEnabled =
      posthog?.isFeatureEnabled("canvas-preview-mode") ?? false;

    // Layout mode state: "grid" = standard layout (Regular Mode), "freeform" = infinite canvas (Canvas Mode)
    // This is only relevant when isCanvasPreviewEnabled is true
    // Uses wire format values for consistency with persistence and MCP tools
    const [canvasLayoutMode, setCanvasLayoutMode] = useState<
      "grid" | "freeform"
    >(initialCanvasState?.layoutMode === "freeform" ? "freeform" : "grid");

    // Canvas ref for infinite canvas mode
    const canvasRef = useRef<PreviewCanvasRef>(null);

    // Container ref for measuring actual available space (for tablet/mobile sizing)
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Determine if this is a web-only framework
    const isWebFramework =
      framework === "web_nextjs_react" || framework === "web_vite_react";

    const [previewMode, setPreviewMode] = useState<PreviewMode>(
      isWebFramework ? "web" : "mobile",
    );
    const [refreshKey, setRefreshKey] = useState(0);

    // Default the preview mode based on framework when it changes, but allow manual toggles afterwards
    useEffect(() => {
      if (!framework) {
        return;
      }

      setPreviewMode(
        framework === "web_nextjs_react" || framework === "web_vite_react"
          ? "web"
          : "mobile",
      );
    }, [framework]);

    // Notify parent when preview mode changes
    useEffect(() => {
      onPreviewModeChange?.(previewMode);
    }, [previewMode, onPreviewModeChange]);
    const [mobileSize, setMobileSize] = useState({ width: 320, height: 640 });
    const [tabletSize, setTabletSize] = useState({ width: 768, height: 1024 });
    const [hasManuallyResized, setHasManuallyResized] = useState(false);

    // Calculate responsive mobile size based on container dimensions
    useEffect(() => {
      const calculateSize = () => {
        if (hasManuallyResized) return;

        // Use container dimensions if available, otherwise fall back to window
        const container = previewContainerRef.current;
        const availableHeight = container
          ? container.clientHeight - 80 // Account for URL bar and padding
          : Math.max(0, window.innerHeight - 180);
        const availableWidth = container
          ? container.clientWidth - 32 // Account for padding
          : window.innerWidth - 116;

        // Standard phone aspect ratio (width / height)
        const aspectRatio = 320 / 640;

        // Use 90% of available height to leave some breathing room
        let newHeight = availableHeight * 0.9;

        // Also consider available width to ensure phone fits horizontally
        const maxHeightBasedOnWidth = availableWidth / aspectRatio;

        // Use the smaller of the two constraints
        newHeight = Math.min(newHeight, maxHeightBasedOnWidth);

        // Clamp to reasonable bounds - much smaller minimum for mobile devices
        newHeight = Math.max(280, newHeight); // Minimum 280px for very small screens
        newHeight = Math.min(1000, newHeight); // Maximum 1000px

        const newWidth = newHeight * aspectRatio;

        setMobileSize({ width: newWidth, height: newHeight });
      };

      // Calculate on mount and resize
      calculateSize();
      window.addEventListener("resize", calculateSize);

      // Also recalculate when container size might change
      const resizeObserver = new ResizeObserver(calculateSize);
      if (previewContainerRef.current) {
        resizeObserver.observe(previewContainerRef.current);
      }

      return () => {
        window.removeEventListener("resize", calculateSize);
        resizeObserver.disconnect();
      };
    }, [hasManuallyResized]);

    // Calculate responsive tablet size based on container dimensions
    useEffect(() => {
      const calculateTabletSize = () => {
        if (hasManuallyResized) return;

        // Use container dimensions if available, otherwise fall back to window
        const container = previewContainerRef.current;
        const availableHeight = container
          ? container.clientHeight - 80 // Account for URL bar and padding
          : Math.max(0, window.innerHeight - 180);
        const availableWidth = container
          ? container.clientWidth - 32 // Account for padding
          : window.innerWidth - 150;

        // Standard tablet aspect ratio (iPad-like: 3:4)
        const aspectRatio = 768 / 1024;

        // Calculate max height that fits within available space
        // Use 90% of available height to leave some breathing room
        let newHeight = availableHeight * 0.9;

        // Also consider available width to ensure tablet fits horizontally
        const maxHeightBasedOnWidth = availableWidth / aspectRatio;

        // Use the smaller of the two constraints
        newHeight = Math.min(newHeight, maxHeightBasedOnWidth);

        // Clamp to reasonable bounds
        newHeight = Math.max(300, newHeight); // Lower minimum for small screens
        newHeight = Math.min(1024, newHeight);

        const newWidth = newHeight * aspectRatio;

        setTabletSize({ width: newWidth, height: newHeight });
      };

      calculateTabletSize();
      window.addEventListener("resize", calculateTabletSize);

      // Also recalculate when container size might change
      const resizeObserver = new ResizeObserver(calculateTabletSize);
      if (previewContainerRef.current) {
        resizeObserver.observe(previewContainerRef.current);
      }

      return () => {
        window.removeEventListener("resize", calculateTabletSize);
        resizeObserver.disconnect();
      };
    }, [hasManuallyResized]);

    const [isIframeLoading, setIsIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isRestartingDevServer, setIsRestartingDevServer] = useState(false);
    const [isBuilding, setIsBuilding] = useState(false);
    const [, setBuildError] = useState<string | null>(null);
    const [mobileScreens, setMobileScreens] = useState<MobileScreenConfig[]>(
      () => {
        // Use initialScreens if provided (from saved public display config)
        if (initialScreens?.length) {
          return initialScreens.map((s) => ({ id: s.id, path: s.path }));
        }
        return viewing_url
          ? [{ id: 0, path: extractInitialPath(viewing_url) }]
          : [];
      },
    );

    // Calculate scaled mobile size based on number of screens
    const scaledMobileSize = React.useMemo(() => {
      if (mobileScreens.length <= 1) {
        return mobileSize;
      }

      // Get available width (approximate viewport width minus padding)
      const availableWidth =
        typeof window !== "undefined" ? window.innerWidth - 100 : 1200;
      const screenCount = mobileScreens.length;
      const gapBetweenScreens = 32; // gap-x-8 = 32px
      const addButtonWidth = mobileSize.width + 48; // Inline add button takes space too

      // Calculate how much width each screen can have
      const totalGapSpace =
        (screenCount - 1) * gapBetweenScreens + addButtonWidth;
      const availablePerScreen = (availableWidth - totalGapSpace) / screenCount;

      // Minimum width threshold (below this, use horizontal scroll)
      const minWidth = 200;
      const maxWidth = mobileSize.width + 16; // Original size + frame

      // Calculate scale factor
      const targetWidth = Math.max(
        minWidth,
        Math.min(maxWidth, availablePerScreen),
      );
      const scaleFactor = targetWidth / (mobileSize.width + 16);

      // Apply scale to both dimensions to maintain aspect ratio
      return {
        width: mobileSize.width * scaleFactor,
        height: mobileSize.height * scaleFactor,
      };
    }, [mobileScreens.length, mobileSize]);

    // Calculate scale factor for iframe content zoom
    const mobileScaleFactor = React.useMemo(() => {
      if (mobileScreens.length <= 1) {
        return 1;
      }
      const targetWidth = scaledMobileSize.width + 16;
      const originalWidth = mobileSize.width + 16;
      return targetWidth / originalWidth;
    }, [mobileScreens.length, scaledMobileSize, mobileSize]);

    // Web screens state for multi-screen web view
    const [webScreens, setWebScreens] = useState<MobileScreenConfig[]>(() => {
      if (initialWebScreens?.length) {
        return initialWebScreens.map((s) => ({ id: s.id, path: s.path }));
      }
      return viewing_url
        ? [{ id: 0, path: extractInitialPath(viewing_url) }]
        : [];
    });
    const nextWebScreenId = useRef(1);

    // No zoom scaling for web iframes - grid cells naturally size the content
    const webScaleFactor = 1;
    const webIframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

    // Web frame sizing
    const [webFrameHeight, setWebFrameHeight] = useState(500);
    const [webFrameWidth, setWebFrameWidth] = useState<number | null>(null); // null = auto (fill container)
    const [isResizingWebFrame, setIsResizingWebFrame] = useState(false);
    const [hasManuallyResizedWebFrame, setHasManuallyResizedWebFrame] =
      useState(false);
    // Web mobile size mode - constrains web view iframe to mobile dimensions
    const [isWebMobileSize, setIsWebMobileSize] = useState(false);
    // Web full-screen mode - expands web view to fill the entire preview area
    const [isWebFullScreen, setIsWebFullScreen] = useState(false);

    // Calculate responsive web frame height based on viewport
    useEffect(() => {
      const calculateWebFrameHeight = () => {
        if (hasManuallyResizedWebFrame) return;

        const vh = window.innerHeight;
        const vw = window.innerWidth;
        // Account for toolbar, padding, and other UI elements
        const uiOverhead = 180;
        const availableHeight = Math.max(0, vh - uiOverhead);

        // On smaller viewports, use less of available height
        const heightPercentage = vw < 768 ? 0.8 : 0.9;
        let newHeight = availableHeight * heightPercentage;

        // Clamp to reasonable bounds
        newHeight = Math.max(350, newHeight); // Lower minimum for mobile
        newHeight = Math.min(1200, newHeight); // Maximum reasonable height

        setWebFrameHeight(newHeight);
      };

      calculateWebFrameHeight();
      window.addEventListener("resize", calculateWebFrameHeight);
      return () =>
        window.removeEventListener("resize", calculateWebFrameHeight);
    }, [hasManuallyResizedWebFrame]);

    // Responsive viewport detection for web grid
    const [isNarrowViewport, setIsNarrowViewport] = useState(false);

    // Web grid layout calculation
    const webGridLayout = React.useMemo(() => {
      const count = webScreens.length;
      if (count <= 1) return { gridTemplate: "1fr", showAddButton: true };
      if (count === 2)
        return { gridTemplate: "repeat(2, 1fr)", showAddButton: true };
      if (count === 3)
        return { gridTemplate: "repeat(2, 1fr)", showAddButton: true };
      return { gridTemplate: "repeat(2, 1fr)", showAddButton: true };
    }, [webScreens.length]);

    const [editingScreenId, setEditingScreenId] = useState<number | null>(null);
    const [editingWebScreenId, setEditingWebScreenId] = useState<number | null>(
      null,
    );
    const [tempPath, setTempPath] = useState<string>("");
    const [routeSuggestions, setRouteSuggestions] = useState<
      Array<{ route: string; group?: string }>
    >([]);
    // Allow screen editing in public view if onScreensChange or onWebScreensChange is provided
    const canEditScreensInPublicView =
      publicView && (!!onScreensChange || !!onWebScreensChange);
    const isReadOnlyView =
      (publicView && !canEditScreensInPublicView) || deployedView;

    // Terminal state
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(250); // Default height in pixels
    const [isResizingTerminal, setIsResizingTerminal] = useState(false);
    const [activeTerminalSession, setActiveTerminalSession] =
      useState<TerminalSession>("dev-server");

    // Mobile resize state
    const [isResizingMobile, setIsResizingMobile] = useState(false);

    // Modal states
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [isGithubDropdownOpen, setIsGithubDropdownOpen] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [projectSettingsTab, setProjectSettingsTab] =
      useState<ProjectSettingsTab>("deploy");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const logPrototypeEvent = useCallback(
      (event: PostHogEvent, properties?: Record<string, unknown>) => {
        logger.log({
          event,
          properties: {
            prototype_id: prototypeId,
            ...properties,
          },
        });
      },
      [logger, prototypeId],
    );

    const handlePreviewToggle = useCallback(
      (isPreview: boolean) => {
        logPrototypeEvent(
          isPreview
            ? "client_prototype_editor_preview_tab_selected"
            : "client_prototype_editor_code_tab_selected",
        );
        onPreviewViewChange(isPreview);
      },
      [logPrototypeEvent, onPreviewViewChange],
    );

    const handleOpenProjectSettings = useCallback(
      (tab: ProjectSettingsTab = "deploy", source?: string) => {
        logPrototypeEvent("client_prototype_editor_project_settings_opened", {
          tab,
          source,
        });
        setProjectSettingsTab(tab);
        setIsProjectSettingsOpen(true);
      },
      [logPrototypeEvent],
    );

    const handleOpenViewOnDevice = useCallback(
      (source: string) => {
        logPrototypeEvent("client_prototype_editor_view_on_device_opened", {
          source,
        });
        setIsQRModalOpen(true);
      },
      [logPrototypeEvent],
    );

    const handleOpenBrowserPreview = useCallback(
      (source: string) => {
        logPrototypeEvent("client_prototype_editor_browser_preview_opened", {
          framework,
          source,
        });
        if (viewing_url) {
          window.open(viewing_url, "_blank", "noopener,noreferrer");
        }
      },
      [framework, logPrototypeEvent, viewing_url],
    );

    const nextMobileScreenId = useRef(1);

    // Ref for the iframe's contentWindow
    const webPreviewRef = useRef<Window | null>(null);

    // Track iframe refs for each mobile screen to monitor navigation
    const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

    useEffect(() => {
      if (!viewing_url) {
        setMobileScreens([]);
        nextMobileScreenId.current = 1;
        return;
      }

      // If initialScreens is provided, restore them from saved config
      if (initialScreens?.length) {
        // Update the nextMobileScreenId to be higher than any existing screen id
        const maxId = Math.max(...initialScreens.map((s) => s.id));
        nextMobileScreenId.current = maxId + 1;
        // Set the mobile screens from the saved config
        logger.debug(
          "log",
          "[MaterializeRenderSection] Restoring mobile screens from initialScreens:",
          { initialScreens },
        );
        setMobileScreens(
          initialScreens.map((s) => ({
            id: s.id,
            path: stripTokenFromPath(s.path),
          })),
        );
        return;
      }

      const initialPath = stripTokenFromPath(extractInitialPath(viewing_url));
      setMobileScreens([{ id: 0, path: initialPath }]);
      nextMobileScreenId.current = 1;

      // Notify parent of initial path
      if (onCurrentPathChange) {
        onCurrentPathChange(initialPath);
      }
    }, [initialScreens, logger, onCurrentPathChange, viewing_url]);

    // Notify parent when screens change (for saving public display config)
    useEffect(() => {
      onScreensChange?.(mobileScreens);
    }, [mobileScreens, onScreensChange]);

    // Notify parent when web screens change
    useEffect(() => {
      onWebScreensChange?.(webScreens);
    }, [webScreens, onWebScreensChange]);

    // Viewport resize listener for web grid responsive layout
    useEffect(() => {
      const checkViewport = () => {
        setIsNarrowViewport(window.innerWidth < 768);
      };
      checkViewport();
      window.addEventListener("resize", checkViewport);
      return () => window.removeEventListener("resize", checkViewport);
    }, []);

    // Initialize web screens from viewing_url when it changes
    useEffect(() => {
      if (!viewing_url) {
        setWebScreens([]);
        nextWebScreenId.current = 1;
        return;
      }

      // If initialWebScreens is provided, restore them from saved config
      if (initialWebScreens?.length) {
        const maxId = Math.max(...initialWebScreens.map((s) => s.id));
        nextWebScreenId.current = maxId + 1;
        // Set the web screens from the saved config
        logger.debug(
          "log",
          "[MaterializeRenderSection] Restoring web screens from initialWebScreens:",
          { initialWebScreens },
        );
        setWebScreens(
          initialWebScreens.map((s) => ({
            id: s.id,
            path: stripTokenFromPath(s.path),
          })),
        );
        return;
      }

      const initialPath = stripTokenFromPath(extractInitialPath(viewing_url));
      setWebScreens([{ id: 0, path: initialPath }]);
      nextWebScreenId.current = 1;
    }, [initialWebScreens, logger, viewing_url]);

    // Monitor iframe navigation to sync the path display
    useEffect(() => {
      const checkIframeNavigation = () => {
        iframeRefs.current.forEach((iframe, screenId) => {
          try {
            // Try to access the iframe's current location
            const iframeWindow = iframe.contentWindow;
            if (!iframeWindow) return;

            const iframeUrl = iframeWindow.location.href;
            // Ignore about:blank URLs (used during refresh operations)
            if (iframeUrl && viewing_url && !iframeUrl.startsWith("about:")) {
              const currentPath = stripTokenFromPath(
                extractInitialPath(iframeUrl),
              );

              // Update the screen's path if it has changed (but not if currently editing)
              setMobileScreens((prev) =>
                prev.map((screen) => {
                  if (
                    screen.id === screenId &&
                    screen.path !== currentPath &&
                    editingScreenId !== screenId
                  ) {
                    // Notify parent if this is the primary screen (id: 0)
                    if (screenId === 0 && onCurrentPathChange) {
                      onCurrentPathChange(currentPath);
                    }
                    return { ...screen, path: currentPath };
                  }
                  return screen;
                }),
              );
            }
          } catch {
            // Cross-origin restrictions will throw errors, which is expected
            // We can't track navigation for cross-origin iframes
            // For same-origin but client-side routed apps, this will still work
          }
        });
      };

      // Check periodically for navigation changes
      const interval = setInterval(checkIframeNavigation, 200);
      return () => clearInterval(interval);
    }, [viewing_url, editingScreenId, onCurrentPathChange]);

    // Listen for messages from iframe for client-side navigation tracking
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        // Validate message origin matches viewing_url origin
        try {
          const viewingOrigin = new URL(viewing_url).origin;
          if (event.origin !== viewingOrigin) return;
        } catch {
          return;
        }

        // Check if this is a navigation message
        if (event.data?.type === "navigation" && event.data?.path) {
          const newPath = stripTokenFromPath(event.data.path);

          // Find which screen this iframe belongs to by matching the source
          iframeRefs.current.forEach((iframe, screenId) => {
            if (iframe.contentWindow === event.source) {
              setMobileScreens((prev) =>
                prev.map((screen) => {
                  if (
                    screen.id === screenId &&
                    screen.path !== newPath &&
                    editingScreenId !== screenId
                  ) {
                    // Notify parent if this is the primary screen (id: 0)
                    if (screenId === 0 && onCurrentPathChange) {
                      onCurrentPathChange(newPath);
                    }
                    return { ...screen, path: newPath };
                  }
                  return screen;
                }),
              );
            }
          });
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [viewing_url, editingScreenId, onCurrentPathChange]);

    const handleAddMobileScreen = useCallback(() => {
      if (!viewing_url) return;

      setMobileScreens((prev) => [
        ...prev,
        { id: nextMobileScreenId.current++, path: "/" },
      ]);
      setIsIframeLoading(true);
      setIframeError(false);
    }, [viewing_url, mobileScreens.length]);

    // Refresh individual screen
    const refreshScreen = useCallback((screenId: number) => {
      const iframe = iframeRefs.current.get(screenId);
      if (iframe) {
        const currentSrc = iframe.src;
        iframe.src = "about:blank";
        setTimeout(() => {
          iframe.src = currentSrc;
        }, 100);
      }
    }, []);

    const handleRemoveMobileScreen = (id: number) => {
      setMobileScreens((prev) => {
        if (prev.length <= 1) {
          return prev;
        }

        return prev.filter((screen) => screen.id !== id);
      });
    };

    // Web screen handlers
    const handleAddWebScreen = useCallback(() => {
      if (!viewing_url) return;

      setWebScreens((prev) => [
        ...prev,
        { id: nextWebScreenId.current++, path: "/" },
      ]);
      setIsIframeLoading(true);
      setIframeError(false);
    }, [viewing_url, webScreens.length]);

    const handleRemoveWebScreen = useCallback((id: number) => {
      setWebScreens((prev) => {
        if (prev.length <= 1) return prev;
        return prev.filter((screen) => screen.id !== id);
      });
    }, []);

    const refreshWebScreen = useCallback((screenId: number) => {
      const iframe = webIframeRefs.current.get(screenId);
      if (iframe) {
        const currentSrc = iframe.src;
        iframe.src = "about:blank";
        setTimeout(() => {
          iframe.src = currentSrc;
        }, 100);
      }
    }, []);

    // Web frame corner resize handler (like resizing a window)
    const handleWebFrameCornerResize = useCallback(
      (e: React.MouseEvent, screenElement: HTMLElement | null) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizingWebFrame(true);
        setHasManuallyResizedWebFrame(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startHeight = webFrameHeight;
        // Get initial width from the element or use a default
        const startWidth = screenElement?.offsetWidth ?? webFrameWidth ?? 800;

        // Constraints
        const maxHeight = window.innerHeight * 0.9;
        const maxWidth = window.innerWidth * 0.9;
        const minHeight = 300;
        const minWidth = 400;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;

          const newWidth = Math.max(
            minWidth,
            Math.min(maxWidth, startWidth + deltaX),
          );
          const newHeight = Math.max(
            minHeight,
            Math.min(maxHeight, startHeight + deltaY),
          );

          setWebFrameWidth(newWidth);
          setWebFrameHeight(newHeight);
        };

        const handleMouseUp = () => {
          setIsResizingWebFrame(false);
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "nwse-resize";
        document.body.style.userSelect = "none";
      },
      [webFrameHeight, webFrameWidth],
    );

    // Web screen path editing handlers
    const handleWebBadgeClick = useCallback(
      (id: number, currentPath: string) => {
        setEditingWebScreenId(id);
        setTempPath(stripTokenFromPath(currentPath));
      },
      [],
    );

    const handleConfirmWebPathChange = useCallback(
      (id: number) => {
        const normalized = stripTokenFromPath(normalizePath(tempPath));
        setWebScreens((prev) =>
          prev.map((screen) => {
            if (screen.id === id && normalized !== screen.path) {
              setIsIframeLoading(true);
              setIframeError(false);
              return { ...screen, path: normalized };
            }
            return screen;
          }),
        );
        setEditingWebScreenId(null);
        setTempPath("");
        setRouteSuggestions([]);
      },
      [tempPath],
    );

    const handleCancelWebEdit = useCallback(() => {
      setEditingWebScreenId(null);
      setTempPath("");
      setRouteSuggestions([]);
    }, []);

    // Extract available routes from files
    const availableRoutes = React.useMemo(() => {
      if (!files) return [];

      const routes: Array<{ route: string; group?: string }> = [];
      Object.keys(files).forEach((filePath) => {
        // Look for files in app/ directory that could be routes
        if (filePath.startsWith("app/")) {
          // Extract route from file path
          // app/about/page.tsx -> /about
          // app/(tabs)/index.tsx -> / with group "tabs"
          // app/(tabs)/profile.tsx -> /profile with group "tabs"
          // app/(tabs)/settings/index.tsx -> /settings with group "tabs"
          const pathWithoutApp = filePath.replace(/^app\//, "");

          // Extract route group if present (e.g., "(tabs)" -> "tabs")
          const routeGroupMatch = pathWithoutApp.match(/^\(([^)]+)\)\//);
          const routeGroup = routeGroupMatch ? routeGroupMatch[1] : undefined;

          // Handle page.tsx files
          if (pathWithoutApp.includes("/page.")) {
            const pathBeforePage = pathWithoutApp.split("/page.")[0];
            // Remove route groups like (tabs), (auth), etc.
            const cleanPath = pathBeforePage.replace(/\(.*?\)\//g, "");
            const route = cleanPath ? "/" + cleanPath : "/";
            routes.push({ route, group: routeGroup });
          }
          // Handle index files
          else if (pathWithoutApp.includes("/index.")) {
            const pathBeforeIndex = pathWithoutApp.split("/index.")[0];
            // Remove route groups like (tabs), (auth), etc.
            const cleanPath = pathBeforeIndex.replace(/\(.*?\)\//g, "");
            const route = cleanPath ? "/" + cleanPath : "/";
            routes.push({ route, group: routeGroup });
          }
          // Handle direct route files (e.g., app/profile.tsx, app/(tabs)/settings.tsx)
          else if (pathWithoutApp.match(/\.(tsx?|jsx?)$/)) {
            const pathBeforeExt = pathWithoutApp.split(".")[0];
            // Remove route groups
            const cleanPath = pathBeforeExt.replace(/\(.*?\)\//g, "");
            // Get the filename
            const parts = cleanPath.split("/");
            const routeName = parts[parts.length - 1];

            if (
              routeName &&
              routeName !== "page" &&
              routeName !== "layout" &&
              routeName !== "_layout"
            ) {
              // If there are parent directories, use the full path
              const route = cleanPath.includes("/")
                ? "/" + cleanPath
                : "/" + routeName;
              routes.push({ route, group: routeGroup });
            }
          }
        }
      });

      // Remove duplicates (based on route path), filter out +html routes, and sort
      const uniqueRoutes = Array.from(
        new Map(routes.map((item) => [item.route, item])).values(),
      )
        .filter((item) => !item.route.includes("+html"))
        .sort((a, b) => a.route.localeCompare(b.route));

      return uniqueRoutes;
    }, [files]);

    const handleBadgeClick = (id: number, currentPath: string) => {
      setEditingScreenId(id);
      setTempPath(stripTokenFromPath(currentPath));
      // Filter suggestions based on current path
      updateRouteSuggestions(stripTokenFromPath(currentPath));
    };

    const updateRouteSuggestions = (input: string) => {
      if (!input || input === "/") {
        setRouteSuggestions(availableRoutes.slice(0, 5));
      } else {
        const filtered = availableRoutes.filter((item) =>
          item.route.toLowerCase().includes(input.toLowerCase()),
        );
        setRouteSuggestions(filtered.slice(0, 5));
      }
    };

    const handlePathInputChange = (value: string) => {
      setTempPath(value);
      updateRouteSuggestions(value);
    };

    const handleConfirmPathChange = (id: number) => {
      const normalized = stripTokenFromPath(normalizePath(tempPath));
      setMobileScreens((prev) =>
        prev.map((screen) => {
          if (screen.id === id && normalized !== screen.path) {
            setIsIframeLoading(true);
            setIframeError(false);
            return { ...screen, path: normalized };
          }
          return screen;
        }),
      );
      setEditingScreenId(null);
      setTempPath("");
      setRouteSuggestions([]);
    };

    const handleCancelEdit = () => {
      setEditingScreenId(null);
      setTempPath("");
      setRouteSuggestions([]);
    };

    const handlePathKeyDown = (id: number, e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleConfirmPathChange(id);
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    };

    const handleSuggestionClick = (id: number, route: string) => {
      setTempPath(route);
      handleConfirmPathChange(id);
    };

    // Force refresh method
    const forceRefresh = useCallback(() => {
      if (viewing_url) {
        // Start loading state for refresh
        setIsIframeLoading(true);
        setIframeError(false);

        // Method 1: Try iframe refresh
        const iframe = document.querySelector(
          'iframe[title="React Native Preview"], iframe[title="React Native Web Preview"]',
        ) as HTMLIFrameElement;
        if (iframe) {
          const currentSrc = iframe.src;
          iframe.src = "about:blank";
          setTimeout(() => {
            iframe.src = currentSrc;
          }, 100);
        }

        // Method 2: Update refresh key to force React re-render
        setRefreshKey((prev) => prev + 1);
      }
    }, [viewing_url]);

    // Expose forceRefresh and updateScreens methods to parent
    useImperativeHandle(
      ref,
      () => ({
        forceRefresh: () => {
          // Use canvas ref if in canvas mode
          if (isCanvasPreviewEnabled && canvasRef.current) {
            canvasRef.current.forceRefresh();
          } else {
            forceRefresh();
          }
        },
        updateScreens: (data: ScreenUpdateData) => {
          // Handle preview mode change if specified
          if (data.previewMode) {
            setPreviewMode(data.previewMode);
          }

          // Handle layout mode change if specified (applies when canvas feature flag is on)
          if (isCanvasPreviewEnabled && data.layoutMode) {
            setCanvasLayoutMode(data.layoutMode);
          }

          // Use canvas ref if in freeform/canvas mode (infinite canvas)
          if (
            isCanvasPreviewEnabled &&
            canvasLayoutMode === "freeform" &&
            canvasRef.current
          ) {
            switch (data.action) {
              case "add":
                if (data.path) {
                  canvasRef.current.addScreen(data.path);
                }
                break;
              case "remove":
                if (data.screenId !== undefined) {
                  canvasRef.current.removeScreen(data.screenId);
                }
                break;
              case "set":
                if (data.screens && data.screens.length > 0) {
                  canvasRef.current.setScreens(
                    data.screens.map((s, index) => ({
                      id: index + 1,
                      path: s.path,
                    })),
                  );
                }
                break;
            }
            return;
          }

          // Legacy mode - use state-based screen management
          // Use the target preview mode (from data or current state)
          const targetPreviewMode = data.previewMode || previewMode;
          const setScreens =
            targetPreviewMode === "mobile" || targetPreviewMode === "tablet"
              ? setMobileScreens
              : setWebScreens;
          const nextIdRef =
            targetPreviewMode === "mobile" || targetPreviewMode === "tablet"
              ? nextMobileScreenId
              : nextWebScreenId;

          switch (data.action) {
            case "add":
              if (data.path) {
                setScreens((prev) => [
                  ...prev,
                  { id: nextIdRef.current++, path: data.path! },
                ]);
              }
              break;
            case "remove":
              if (data.screenId !== undefined) {
                setScreens((prev) => {
                  // Don't allow removing the last screen
                  if (prev.length <= 1) {
                    logger.debug("warn", "Cannot remove last screen");
                    return prev;
                  }
                  return prev.filter((s) => s.id !== data.screenId);
                });
              }
              break;
            case "set":
              if (data.screens && data.screens.length > 0) {
                let idCounter = 0;
                setScreens(
                  data.screens.map((s) => ({ id: idCounter++, path: s.path })),
                );
                nextIdRef.current = idCounter;
              }
              break;
          }
        },
        openProjectSettings: (tab?: ProjectSettingsTab) => {
          handleOpenProjectSettings(tab || "details", "chat_panel_name_click");
        },
      }),
      [
        forceRefresh,
        previewMode,
        mobileScreens,
        webScreens,
        logger,
        isCanvasPreviewEnabled,
        handleOpenProjectSettings,
      ],
    );

    const handleRestartDevServer = async () => {
      logPrototypeEvent("client_prototype_editor_restart_dev_server_clicked", {
        has_prototype: Boolean(prototypeId),
        has_sandbox: Boolean(sandbox_url),
      });
      if (!prototypeId) {
        logger.debug(
          "error",
          "Cannot restart dev server: missing prototype ID",
        );
        return;
      }

      if (!sandbox_url) {
        logger.debug("error", "Cannot restart dev server: missing sandbox URL");
        return;
      }

      setIsRestartingDevServer(true);
      onRenderStatusChange("Starting Dev Server..");

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

        const response = await fetch(`${sandbox_url}/dev-server/restart-v2`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        const result: APIResponse<
          PublicDevServerRestartSuccessResponse,
          StandardErrorResponse
        > = await response.json();
        if (response.ok && result.data) {
          // Force refresh the preview to reload
          forceRefresh();
        } else {
          logger.debug("error", "Failed to restart dev server:", {
            error: result.error?.message,
          });
          onRenderStatusChange("Error");
        }
      } catch (error) {
        logger.debug("error", "Error restarting dev server:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        onRenderStatusChange("Disconnected");
      } finally {
        setIsRestartingDevServer(false);
      }
    };

    const handleBuildAndDeploy = async () => {
      logPrototypeEvent("client_prototype_editor_build_and_deploy_clicked", {
        has_sandbox: Boolean(sandbox_url),
        framework,
      });
      if (!sandbox_url || !prototypeId) {
        logger.debug(
          "error",
          "Cannot build: missing sandbox URL or prototype ID",
        );
        return;
      }

      let buildStartTimeout: number | null = null;
      let buildStarted = false;
      let hasInitiatedBuildRequest = false;
      let buildStartToastId: string | number | null = null;

      const dismissBuildStartToast = () => {
        if (buildStartToastId !== null) {
          toast.dismiss(buildStartToastId);
          buildStartToastId = null;
        }
      };

      const resetBuildStartUI = () => {
        dismissBuildStartToast();
        if (buildStarted) {
          setIsTerminalOpen(false);
          setActiveTerminalSession("dev-server");
        }
      };

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          toast.error("Authentication required to build");
          return;
        }

        setBuildError(null);
        setIsBuilding(true);
        hasInitiatedBuildRequest = true;

        const triggerBuildFlow = () => {
          buildStarted = true;
          setIsTerminalOpen(true);
          setActiveTerminalSession("build");
          buildStartToastId = toast.info(
            "Build started! This may take a couple of minutes...",
          );
        };

        const BUILD_START_DELAY_MS = 1000;
        buildStartTimeout = window.setTimeout(
          triggerBuildFlow,
          BUILD_START_DELAY_MS,
        );

        const response = await fetch(
          `${sandbox_url}/dev-server/build-and-deploy`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result: APIResponse<
          BuildAndDeployResponse,
          StandardErrorResponse
        > = await response.json().catch(() => ({ data: null, error: null }));

        if (response.status === HTTP_STATUS.CONFLICT) {
          const warningMessage =
            result.error?.message ?? "A build is already in progress.";
          dismissBuildStartToast();
          setIsTerminalOpen(true);
          setActiveTerminalSession("build");
          toast.warning(warningMessage);
          logger.debug("log", "Build already in progress", {
            prototypeId,
            warningMessage,
          });
          return;
        }

        if (!response.ok || result.error) {
          const errorMessage =
            result.error?.message ?? "Build and deploy failed";
          setBuildError(errorMessage);
          toast.error(`Build failed: ${errorMessage}`);
          logger.debug("error", "Build and deploy failed", {
            error: errorMessage,
          });
          return;
        }

        setBuildError(null);

        if (!buildStarted) {
          const alreadyValidMessage =
            "There have been no changes since the last build";
          resetBuildStartUI();
          toast.info(alreadyValidMessage);
          logger.debug("log", "Build already valid", {
            prototypeId,
            message: result.data?.message ?? alreadyValidMessage,
          });
          return;
        }

        toast.success("Build and deploy completed successfully!");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setBuildError(errorMessage);
        logger.debug("error", "Error in handleBuildAndDeploy:", {
          error: errorMessage,
        });
        toast.error(`Failed to build: ${errorMessage}`);
      } finally {
        if (buildStartTimeout) {
          clearTimeout(buildStartTimeout);
          buildStartTimeout = null;
        }
        if (hasInitiatedBuildRequest) {
          setIsBuilding(false);
        }
      }
    };

    const handleCreateGitHubRepository = async () => {
      logPrototypeEvent("client_prototype_editor_create_github_repo_clicked", {
        has_prototype: Boolean(prototypeId),
        has_sandbox: Boolean(sandbox_url),
      });

      if (!prototypeId) {
        logger.debug(
          "error",
          "Cannot create GitHub repository: missing prototype ID",
        );
        toast.error("Missing prototype ID");
        return;
      }

      if (!sandbox_url) {
        logger.debug(
          "error",
          "Cannot create GitHub repository: missing sandbox URL",
        );
        toast.error("Missing sandbox URL");
        return;
      }

      // Set loading state
      setGithubRepoError(null);
      setGithubRepository({ html_url: null, loading: true });

      try {
        // Get authentication token
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          toast.error("Authentication required");
          setGithubRepository({ html_url: null, loading: false });
          return;
        }

        toast.info("Creating GitHub repository...");

        // Step 1: Create the GitHub repository via control-plane
        const createRepoResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/github/repo/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prototype_id: prototypeId }),
          },
        );

        const createRepoResult: APIResponse<
          {
            owner: string;
            name: string;
            html_url: string;
            default_branch: string;
          },
          StandardErrorResponse
        > = await createRepoResponse.json();

        if (!createRepoResponse.ok || createRepoResult.error) {
          const errorMessage =
            createRepoResult.error?.message ??
            "Failed to create GitHub repository";
          logger.debug("error", "GitHub repository creation failed", {
            error: errorMessage,
          });
          toast.error(`Failed to create repository: ${errorMessage}`);
          setGithubRepoError(errorMessage);
          setGithubRepository({ html_url: null, loading: false });
          return;
        }

        const repositoryData = createRepoResult.data;
        toast.success("Repository created! Connecting to sandbox...");

        // Step 2: Connect the repository to the sandbox
        const connectResponse = await fetch(
          `${sandbox_url}/dev-server/connect-github`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          },
        );

        const connectResult: APIResponse<
          {
            message: string;
            repository_url: string;
            repository_full_name: string;
          },
          StandardErrorResponse
        > = await connectResponse.json();

        if (!connectResponse.ok || connectResult.error) {
          const errorMessage =
            connectResult.error?.message ??
            "Failed to connect repository to sandbox";
          logger.debug("error", "GitHub repository connection failed", {
            error: errorMessage,
          });
          toast.error(
            `Repository created but connection failed: ${errorMessage}`,
          );
          // Still update the state with the repository URL since it was created
          setGithubRepository({
            html_url: repositoryData.html_url,
            loading: false,
          });
          setIsGithubDropdownOpen(false);
          return;
        }

        // Success! Update state and close dropdown
        setGithubRepository({
          html_url: repositoryData.html_url,
          loading: false,
        });
        setGithubRepoError(null);
        toast.success("GitHub repository connected successfully!");
        setIsGithubDropdownOpen(false);

        logger.debug("log", "GitHub repository created and connected", {
          repository_url: repositoryData.html_url,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.debug("error", "Error creating GitHub repository", {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        });
        toast.error(`Failed to create repository: ${errorMessage}`);
        setGithubRepoError(errorMessage);
        setGithubRepository({ html_url: null, loading: false });
      }
    };

    const handleRefresh = () => {
      logPrototypeEvent("client_prototype_editor_refresh_preview_clicked", {
        status: currentRenderStatus,
      });
      if (webPreviewRef.current && viewing_url) {
        setIsIframeLoading(true);
        setIframeError(false);
        webPreviewRef.current.location = viewing_url;
      }
    };

    const handleExport = useCallback(async () => {
      logPrototypeEvent("client_prototype_editor_export_clicked", {
        can_export: IsUserPlanSubscribed(userPlan),
        file_count: files ? Object.keys(files).length : 0,
      });
      if (loadingSubscriptionData) {
        alert(
          "We're still loading your subscription status. Please try again in a moment.",
        );
        return;
      }

      if (!IsUserPlanSubscribed(userPlan)) {
        alert("Upgrade plan to export your project.");
        return;
      }

      if (!files || Object.keys(files).length === 0) {
        alert("No files available to export.");
        return;
      }

      setIsExporting(true);

      try {
        const zip = new JSZip();

        Object.values(files).forEach((file) => {
          zip.file(file.name, file.contents ?? "");
        });

        if (assets && Object.keys(assets).length > 0 && prototypeId) {
          const assetsFolder = zip.folder("assets");
          if (assetsFolder) {
            // Generate signed URLs on-demand for all assets
            const assetNames = Object.keys(assets);
            const signedUrls = await getBulkAssetSignedUrls(
              prototypeId,
              assetNames,
            );

            await Promise.all(
              Object.values(assets).map(async (asset) => {
                const sanitizedName = asset.name.replace(/^assets\//i, "");

                try {
                  const storageUrl = signedUrls[asset.name];
                  if (!storageUrl) {
                    throw new Error(`No storage URL for asset: ${asset.name}`);
                  }

                  const response = await fetch(storageUrl);
                  if (!response.ok) {
                    throw new Error(`Failed to fetch asset: ${asset.name}`);
                  }

                  const blob = await response.blob();
                  assetsFolder.file(sanitizedName, blob);
                } catch (error) {
                  logger.debug("error", "Failed to include asset in export", {
                    asset: asset.name,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }),
            );
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const downloadUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        const exportName = prototypeId
          ? `nucleate-project-${prototypeId}.zip`
          : "nucleate-project-export.zip";

        link.href = downloadUrl;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      } catch (error) {
        logger.debug("error", "Failed to export files", {
          error: error instanceof Error ? error.message : String(error),
        });
        alert("Failed to export files. Please try again.");
      } finally {
        setIsExporting(false);
      }
    }, [
      assets,
      files,
      loadingSubscriptionData,
      logPrototypeEvent,
      logger,
      prototypeId,
      userPlan,
    ]);

    const handleModeChange = (mode: PreviewMode) => {
      logPrototypeEvent("client_prototype_editor_preview_mode_changed", {
        mode,
      });
      setPreviewMode(mode);
      // Trigger loading state when switching preview modes
      if (viewing_url) {
        setIsIframeLoading(false);
        setIframeError(false);
      }
    };

    const handleAddCanvasScreen = useCallback(() => {
      if (canvasRef.current) {
        canvasRef.current.addScreen("/");
      }
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setHasManuallyResized(true);
      setIsResizingMobile(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = mobileSize.width;
      const startHeight = mobileSize.height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const newWidth = Math.max(250, Math.min(500, startWidth + deltaX));
        const newHeight = Math.max(400, Math.min(800, startHeight + deltaY));

        setMobileSize({ width: newWidth, height: newHeight });
      };

      const handleMouseUp = () => {
        setIsResizingMobile(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
    };

    // Terminal resize handler
    const handleTerminalResizeStart = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizingTerminal(true);

      const startY = e.clientY;
      const startHeight = terminalHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY; // Inverted because terminal grows upward
        // Allow terminal to grow up to 90% of viewport height
        const maxHeight = window.innerHeight * 0.9;
        const newHeight = Math.max(
          150,
          Math.min(maxHeight, startHeight + deltaY),
        );
        setTerminalHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizingTerminal(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    };

    // Handle iframe loading events
    const handleIframeLoad = useCallback(() => {
      setIsIframeLoading(false);
      setIframeError(false);
      // Update status based on whether it's a dev server or static build
      const isDevServer =
        viewing_url.includes("localhost") ||
        viewing_url.includes("127.0.0.1") ||
        viewing_url.includes("ngrok") ||
        viewing_url.includes("tunnel") ||
        viewing_url.includes("19006") ||
        viewing_url.includes("sandbox.nucleate.dev") ||
        viewing_url?.includes("trycloudflare");
      if (isDevServer) onRenderStatusChange("Connected");
    }, [viewing_url, onRenderStatusChange]);

    const handleIframeError = useCallback(() => {
      setIsIframeLoading(false);
      setIframeError(true);
      onRenderStatusChange("Disconnected");
    }, [onRenderStatusChange]);

    // Screen action handlers for ScreenActions component
    const handleScreenScreenshot = useCallback(
      async (screenId: number, path: string) => {
        // Find the iframe element for this screen
        const iframe = document.querySelector(
          `iframe[data-screen-id="${screenId}"]`,
        ) as HTMLIFrameElement | null;

        if (!iframe) {
          toast.error("Could not find screen to screenshot");
          return;
        }

        try {
          // For cross-origin iframes, we need to use the sandbox API to take a screenshot
          if (sandbox_url) {
            const screenshotUrl = `${sandbox_url}/api/screenshot?path=${encodeURIComponent(path)}`;
            const response = await fetch(screenshotUrl);
            if (response.ok) {
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);

              // Create download link
              const a = document.createElement("a");
              a.href = url;
              a.download = `screenshot-${path.replace(/\//g, "-") || "home"}-${Date.now()}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              toast.success("Screenshot saved");
            } else {
              throw new Error("Screenshot failed");
            }
          } else {
            // Fallback: copy the viewing URL to clipboard
            const fullUrl = `${viewing_url}${path}`;
            await navigator.clipboard.writeText(fullUrl);
            toast.info("Screenshot not available", {
              description: "URL copied to clipboard instead",
            });
          }
        } catch {
          toast.error("Failed to take screenshot");
        }
      },
      [sandbox_url, viewing_url],
    );

    const handleScreenClone = useCallback(
      (screenId: number, path: string) => {
        if (previewMode === "mobile" || previewMode === "tablet") {
          // Clone mobile screen
          setMobileScreens((prev) => [
            ...prev,
            { id: nextMobileScreenId.current++, path },
          ]);
          toast.success("Screen cloned");
        } else {
          // Clone web screen
          setWebScreens((prev) => [
            ...prev,
            { id: nextWebScreenId.current++, path },
          ]);
          toast.success("Screen cloned");
        }
      },
      [previewMode, mobileScreens.length, webScreens.length],
    );

    const handleScreenAIAction = useCallback(
      async (screenId: number, path: string, action: AIActionType) => {
        // Take a screenshot first if we have sandbox access
        let screenshotDataUrl: string | undefined;

        if (sandbox_url) {
          try {
            const screenshotUrl = `${sandbox_url}/api/screenshot?path=${encodeURIComponent(path)}`;
            const response = await fetch(screenshotUrl);
            if (response.ok) {
              const blob = await response.blob();
              // Convert to data URL for passing to parent
              screenshotDataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch {
            // Continue without screenshot
          }
        }

        // Call the parent callback with the action
        if (onScreenAIAction) {
          onScreenAIAction(screenId, path, action, screenshotDataUrl);
        } else {
          // Default behavior: show a toast indicating the action
          const actionLabels: Record<AIActionType, string> = {
            redesign: "Redesign this screen",
            "suggest-improvements": "Suggest improvements",
            "copy-alternatives": "Generate copy alternatives",
          };
          toast.info(`AI Action: ${actionLabels[action]}`, {
            description: `For screen at ${path}. Connect onScreenAIAction prop to enable.`,
          });
        }
      },
      [sandbox_url, onScreenAIAction],
    );

    const handleGlobalAIAction = useCallback(
      async (action: GlobalAIAction) => {
        // Collect screenshots from all visible screens
        let screenshotDataUrls: string[] = [];

        if (sandbox_url) {
          const screens = previewMode === "web" ? webScreens : mobileScreens;

          try {
            // Take screenshots of all screens in parallel
            const screenshotPromises = screens.map(async (screen) => {
              const screenshotUrl = `${sandbox_url}/api/screenshot?path=${encodeURIComponent(screen.path)}`;
              const response = await fetch(screenshotUrl);
              if (response.ok) {
                const blob = await response.blob();
                return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
              }
              return null;
            });

            const results = await Promise.all(screenshotPromises);
            screenshotDataUrls = results.filter(
              (url): url is string => url !== null,
            );
          } catch {
            // Continue without screenshots
          }
        }

        // Call the parent callback with the action
        if (onGlobalAIAction) {
          onGlobalAIAction(action, screenshotDataUrls);
        } else {
          // Default behavior: show a toast indicating the action
          const actionLabels: Record<GlobalAIAction, string> = {
            "generate-prd": "Generate PRD",
            "critique-designs": "Critique designs",
          };
          toast.info(`AI Action: ${actionLabels[action]}`, {
            description: `Connect onGlobalAIAction prop to enable this feature.`,
          });
        }
      },
      [sandbox_url, previewMode, webScreens, mobileScreens, onGlobalAIAction],
    );

    // Start loading when viewing_url changes
    useEffect(() => {
      setIsIframeLoading(true);
      setIframeError(false);
      const isDevServer =
        viewing_url.includes("localhost") ||
        viewing_url.includes("127.0.0.1") ||
        viewing_url.includes("ngrok") ||
        viewing_url.includes("tunnel") ||
        viewing_url.includes("19006") ||
        viewing_url.includes("sandbox.nucleate.dev") ||
        viewing_url?.includes("trycloudflare");
      if (isDevServer) {
        onRenderStatusChange("Connecting..");
      }
    }, [viewing_url, onRenderStatusChange]);

    // Connection status indicator component using shadcn Badge
    const ConnectionStatusIndicator = () => {
      const getBadgeConfig = (status: RenderStatus) => {
        switch (status) {
          case "Static build":
            return {
              className:
                "bg-accent border border-border text-muted-foreground hover:bg-accent/80 hover:text-foreground transition-colors",
              dotClassName:
                "w-2 h-2 bg-info/50 border border-info rounded-full",
              text: "Static Build",
              animate: false,
            };
          case "Updating..":
          case "Connecting..":
            return {
              className:
                "bg-warning/10 border border-warning/30 text-foreground",
              dotClassName:
                "w-2 h-2 bg-warning rounded-full animate-pulse shadow-[0_0_8px_hsl(var(--warning)/0.6)]",
              text: status,
              animate: true,
            };
          case "Starting Dev Server..":
            return {
              className:
                "bg-warning/10 border border-warning/30 text-foreground",
              dotClassName:
                "w-2 h-2 bg-warning rounded-full animate-pulse shadow-[0_0_8px_hsl(var(--warning)/0.6)]",
              text: "Starting Dev Server.. (~1m)",
              animate: true,
            };
          case "Error":
            return {
              className:
                "bg-destructive/10 border border-destructive/30 text-destructive",
              dotClassName:
                "w-2 h-2 bg-destructive rounded-full shadow-[0_0_8px_hsl(var(--destructive)/0.6)]",
              text: "Error",
              animate: false,
            };
          case "Disconnected":
            return {
              className:
                "bg-destructive/10 border border-destructive/30 text-destructive",
              dotClassName:
                "w-2 h-2 bg-destructive rounded-full shadow-[0_0_8px_hsl(var(--destructive)/0.6)]",
              text: "Disconnected",
              animate: false,
            };
          case "Connected":
            return {
              className: "bg-success/10 border border-success/30 text-success",
              dotClassName:
                "w-2 h-2 bg-success rounded-full shadow-[0_0_8px_hsl(var(--success)/0.6)]",
              text: "Connected",
              animate: false,
            };
        }
      };

      const config = getBadgeConfig(currentRenderStatus);
      const isStaticBuild = currentRenderStatus === "Static build";
      const isConnected = currentRenderStatus === "Connected";

      return (
        <div
          className={cn(
            "inline-flex items-center h-7 px-3 rounded-md text-xs font-medium select-none",
            config?.className,
          )}
        >
          <div className={cn("mr-2", config?.dotClassName)}></div>
          {config?.text}
          {isStaticBuild && prototypeId && onStartDevServer && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartDevServer();
                    }}
                    className="ml-2 p-1 hover:bg-accent rounded-md transition-colors group"
                    aria-label="Start Dev Server"
                  >
                    <Zap className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start Dev Server</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isConnected && prototypeId && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefresh();
                    }}
                    className="ml-2 p-1 hover:bg-accent rounded-md transition-colors group"
                    aria-label="Refresh Preview"
                  >
                    <RefreshCw className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh Preview</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    };

    // Connection loading overlay for iframe
    const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-accent p-6 rounded-xl border border-border shadow-2xl">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-foreground font-medium mb-1">
            Connecting to Preview
          </p>
          <p className="text-muted-foreground text-sm">
            {mode === "mobile"
              ? "Loading mobile preview..."
              : "Loading web preview..."}
          </p>
        </div>
      </div>
    );

    // Error overlay for iframe
    const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-accent p-6 rounded-xl border border-red-500/20 shadow-2xl">
          <div className="w-8 h-8 mx-auto mb-3 text-red-400 bg-red-400/10 rounded-full flex items-center justify-center">
            <X className="w-4 h-4" />
          </div>
          <p className="text-foreground font-medium mb-1">Connection Failed</p>
          <p className="text-muted-foreground text-sm mb-4">
            Unable to load {mode === "mobile" ? "mobile" : "web"} preview
          </p>
          <Button
            size="sm"
            onClick={() => {
              logPrototypeEvent(
                "client_prototype_editor_refresh_preview_clicked",
                {
                  status: "error_overlay",
                },
              );
              setIframeError(false);
              setIsIframeLoading(true);
              setRefreshKey((prev) => prev + 1);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-4 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-2" />
            Retry Connection
          </Button>
        </div>
      </div>
    );

    const renderPreviewContent = (): ReactNode => {
      if (!viewing_url) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-accent p-8 rounded-xl border border-border">
              <div className="w-12 h-12 bg-accent/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Monitor className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-foreground text-sm font-medium">
                No preview URL provided
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                The server has not returned a viewing URL yet.
              </p>
            </div>
          </div>
        );
      }

      if (previewMode === "mobile") {
        return (
          <div
            ref={previewContainerRef}
            className="w-full h-full overflow-hidden bg-background"
          >
            <div className="h-full flex items-center justify-center overflow-auto">
              <div
                className={cn(
                  "flex flex-wrap justify-center gap-x-8 gap-y-12 pb-8 relative",
                  mobileScreens.length > 1 ? "pt-16" : "pt-8",
                )}
              >
                {mobileScreens.map((screen, index) => {
                  const iframeSrc = resolveIframeSrc(viewing_url, screen.path);
                  const isPrimaryScreen = index === 0;

                  return (
                    <div
                      key={`mobile-screen-${screen.id}`}
                      className="flex flex-col items-center gap-2 pt-2"
                    >
                      <div
                        className="relative mx-auto select-none"
                        style={{
                          width: scaledMobileSize.width + 16,
                          height: scaledMobileSize.height + 16,
                        }}
                      >
                        {/* URL Bar / Controls */}
                        {
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
                            <div className="flex items-center gap-1.5">
                              {isReadOnlyView ? (
                                <div
                                  className="px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-sm max-w-[200px] whitespace-nowrap overflow-hidden bg-accent/50 border border-border/50 text-muted-foreground/70"
                                  style={{
                                    maskImage:
                                      "linear-gradient(to right, black 80%, transparent 100%)",
                                    WebkitMaskImage:
                                      "linear-gradient(to right, black 80%, transparent 100%)",
                                  }}
                                >
                                  {stripTokenFromPath(screen.path) || "/"}
                                </div>
                              ) : (
                                <Popover
                                  open={editingScreenId === screen.id}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      handleBadgeClick(screen.id, screen.path);
                                    } else {
                                      handleCancelEdit();
                                    }
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <div
                                      className="px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-sm max-w-[200px] whitespace-nowrap overflow-hidden bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 cursor-pointer"
                                      style={{
                                        maskImage:
                                          "linear-gradient(to right, black 80%, transparent 100%)",
                                        WebkitMaskImage:
                                          "linear-gradient(to right, black 80%, transparent 100%)",
                                      }}
                                    >
                                      {stripTokenFromPath(screen.path) || "/"}
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-56 p-0"
                                    align="center"
                                    sideOffset={8}
                                  >
                                    {availableRoutes.length > 0 && (
                                      <div className="max-h-48 overflow-y-auto">
                                        <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                          Available Routes
                                        </div>
                                        {availableRoutes.map((item) => (
                                          <button
                                            key={item.route}
                                            onClick={() => {
                                              handleSuggestionClick(
                                                screen.id,
                                                item.route,
                                              );
                                            }}
                                            className={cn(
                                              "flex items-center justify-between w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                                              screen.path === item.route
                                                ? "text-foreground bg-accent/50"
                                                : "text-muted-foreground",
                                            )}
                                          >
                                            <span className="font-mono">
                                              {item.route}
                                            </span>
                                            {item.group && (
                                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground border border-border">
                                                {item.group}
                                              </span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="border-t border-border p-2">
                                      <div className="flex items-center gap-1">
                                        <Input
                                          value={tempPath}
                                          onChange={(e) =>
                                            handlePathInputChange(
                                              e.target.value,
                                            )
                                          }
                                          onKeyDown={(e) =>
                                            handlePathKeyDown(screen.id, e)
                                          }
                                          className="h-7 text-xs font-mono border-border"
                                          placeholder="Custom path..."
                                        />
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                          onClick={() =>
                                            handleConfirmPathChange(screen.id)
                                          }
                                          aria-label="Go to path"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {!isReadOnlyView && (
                                <>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-accent/80 text-muted-foreground"
                                        aria-label="Screen actions"
                                      >
                                        <MoreVertical className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-52 bg-accent border-border text-foreground"
                                    >
                                      <DropdownMenuItem
                                        onClick={() => refreshScreen(screen.id)}
                                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                      >
                                        <RefreshCw className="w-4 h-4 mr-2 opacity-70" />
                                        Refresh
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="bg-border" />
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleScreenAIAction(
                                            screen.id,
                                            screen.path,
                                            "redesign",
                                          )
                                        }
                                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                      >
                                        <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                                        Redesign this screen
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleScreenAIAction(
                                            screen.id,
                                            screen.path,
                                            "suggest-improvements",
                                          )
                                        }
                                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                      >
                                        <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
                                        Suggest improvements
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleScreenAIAction(
                                            screen.id,
                                            screen.path,
                                            "copy-alternatives",
                                          )
                                        }
                                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                      >
                                        <Type className="w-4 h-4 mr-2 text-blue-400" />
                                        Generate copy alternatives
                                      </DropdownMenuItem>
                                      {mobileScreens.length > 1 && (
                                        <>
                                          <DropdownMenuSeparator className="bg-border" />
                                          <DropdownMenuItem
                                            onClick={() =>
                                              handleRemoveMobileScreen(
                                                screen.id,
                                              )
                                            }
                                            className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-sm cursor-pointer"
                                          >
                                            <X className="w-4 h-4 mr-2 opacity-70" />
                                            Remove screen
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </div>
                          </div>
                        }

                        {/* Phone Frame */}
                        <div
                          className="relative bg-[#0B0C0E] shadow-2xl"
                          style={{
                            width: scaledMobileSize.width + 16,
                            height: scaledMobileSize.height + 16,
                            borderRadius: "2.5rem",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow:
                              "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0,0,0,0.5)",
                          }}
                        >
                          {/* Buttons */}
                          <div className="absolute -left-[2px] top-[80px] w-[2px] h-[24px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -left-[2px] top-[120px] w-[2px] h-[40px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -left-[2px] top-[170px] w-[2px] h-[40px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -right-[2px] top-[140px] w-[2px] h-[60px] bg-[#333] rounded-r-md"></div>

                          {/* Screen Content */}
                          <div
                            className="absolute bg-white overflow-hidden"
                            style={{
                              width: scaledMobileSize.width,
                              height: scaledMobileSize.height,
                              top: "8px",
                              left: "8px",
                              borderRadius: "2rem",
                            }}
                          >
                            <div className="relative w-full h-full bg-white">
                              <iframe
                                key={`mobile-${screen.id}-${refreshKey}`}
                                ref={(c) => {
                                  if (c) {
                                    iframeRefs.current.set(screen.id, c);
                                    if (isPrimaryScreen) {
                                      webPreviewRef.current =
                                        c.contentWindow ?? null;
                                    }
                                  } else {
                                    iframeRefs.current.delete(screen.id);
                                  }
                                }}
                                className="w-full h-full"
                                style={{
                                  zoom: mobileScaleFactor,
                                  transformOrigin: "top left",
                                  // Disable pointer events during any resize so mouse events reach the document
                                  pointerEvents:
                                    isResizingMobile ||
                                    isResizingWebFrame ||
                                    isResizingTerminal
                                      ? "none"
                                      : "auto",
                                }}
                                title="React Native Preview"
                                aria-label={`React Native Preview ${screen.path}`}
                                src={iframeSrc}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                                allow="microphone; camera;"
                                onLoad={handleIframeLoad}
                                onError={handleIframeError}
                              />
                              {isIframeLoading && (
                                <ConnectionLoadingOverlay mode="mobile" />
                              )}
                              {iframeError && (
                                <ConnectionErrorOverlay mode="mobile" />
                              )}
                            </div>
                          </div>

                          {/* Resize Handle */}
                          <div
                            className="absolute bottom-4 right-4 w-6 h-6 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity z-30"
                            onMouseDown={handleMouseDown}
                          >
                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/40 rounded-br"></div>
                            <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-white/20 rounded-br"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      if (previewMode === "tablet") {
        return (
          <div
            ref={previewContainerRef}
            className="w-full h-full overflow-hidden bg-background"
          >
            <div className="h-full flex items-center justify-center overflow-auto">
              <div
                className={cn(
                  "flex flex-wrap justify-center gap-x-8 gap-y-12 pb-8 relative",
                  mobileScreens.length > 1 ? "pt-16" : "pt-8",
                )}
              >
                {mobileScreens.map((screen, index) => {
                  const iframeSrc = resolveIframeSrc(viewing_url, screen.path);
                  const isPrimaryScreen = index === 0;

                  return (
                    <div
                      key={`tablet-screen-${screen.id}`}
                      className="flex flex-col items-center gap-2 pt-2"
                    >
                      <div
                        className="relative mx-auto select-none"
                        style={{
                          width: tabletSize.width + 24,
                          height: tabletSize.height + 24,
                        }}
                      >
                        {/* URL Bar / Controls */}
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
                          <div className="flex items-center gap-1.5">
                            {isReadOnlyView ? (
                              <div
                                className="px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-sm max-w-[250px] whitespace-nowrap overflow-hidden bg-accent/50 border border-border/50 text-muted-foreground/70"
                                style={{
                                  maskImage:
                                    "linear-gradient(to right, black 80%, transparent 100%)",
                                  WebkitMaskImage:
                                    "linear-gradient(to right, black 80%, transparent 100%)",
                                }}
                              >
                                {stripTokenFromPath(screen.path) || "/"}
                              </div>
                            ) : (
                              <Popover
                                open={editingScreenId === screen.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    handleBadgeClick(screen.id, screen.path);
                                  } else {
                                    handleCancelEdit();
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <div
                                    className="px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-sm max-w-[250px] whitespace-nowrap overflow-hidden bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 cursor-pointer"
                                    style={{
                                      maskImage:
                                        "linear-gradient(to right, black 80%, transparent 100%)",
                                      WebkitMaskImage:
                                        "linear-gradient(to right, black 80%, transparent 100%)",
                                    }}
                                  >
                                    {stripTokenFromPath(screen.path) || "/"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-56 p-0"
                                  align="center"
                                  sideOffset={8}
                                >
                                  {availableRoutes.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto">
                                      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Available Routes
                                      </div>
                                      {availableRoutes.map((item) => (
                                        <button
                                          key={item.route}
                                          onClick={() => {
                                            handleSuggestionClick(
                                              screen.id,
                                              item.route,
                                            );
                                          }}
                                          className={cn(
                                            "flex items-center justify-between w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                                            screen.path === item.route
                                              ? "text-foreground bg-accent/50"
                                              : "text-muted-foreground",
                                          )}
                                        >
                                          <span className="font-mono">
                                            {item.route}
                                          </span>
                                          {item.group && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground border border-border">
                                              {item.group}
                                            </span>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="border-t border-border p-2">
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={tempPath}
                                        onChange={(e) =>
                                          handlePathInputChange(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                          handlePathKeyDown(screen.id, e)
                                        }
                                        className="h-7 text-xs font-mono border-border"
                                        placeholder="Custom path..."
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                        onClick={() =>
                                          handleConfirmPathChange(screen.id)
                                        }
                                        aria-label="Go to path"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                            {!isReadOnlyView && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-accent/80 text-muted-foreground"
                                    aria-label="Screen actions"
                                  >
                                    <MoreVertical className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-52 bg-accent border-border text-foreground"
                                >
                                  <DropdownMenuItem
                                    onClick={() => refreshScreen(screen.id)}
                                    className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                  >
                                    <RefreshCw className="w-4 h-4 mr-2 opacity-70" />
                                    Refresh
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-border" />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleScreenAIAction(
                                        screen.id,
                                        screen.path,
                                        "redesign",
                                      )
                                    }
                                    className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                  >
                                    <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                                    Redesign this screen
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleScreenAIAction(
                                        screen.id,
                                        screen.path,
                                        "suggest-improvements",
                                      )
                                    }
                                    className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                  >
                                    <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
                                    Suggest improvements
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleScreenAIAction(
                                        screen.id,
                                        screen.path,
                                        "copy-alternatives",
                                      )
                                    }
                                    className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                                  >
                                    <Type className="w-4 h-4 mr-2 text-blue-400" />
                                    Generate copy alternatives
                                  </DropdownMenuItem>
                                  {mobileScreens.length > 1 && (
                                    <>
                                      <DropdownMenuSeparator className="bg-border" />
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleRemoveMobileScreen(screen.id)
                                        }
                                        className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-sm cursor-pointer"
                                      >
                                        <X className="w-4 h-4 mr-2 opacity-70" />
                                        Remove screen
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {/* Tablet Frame */}
                        <div
                          className="relative bg-[#1C1C1E] shadow-2xl"
                          style={{
                            width: tabletSize.width + 24,
                            height: tabletSize.height + 24,
                            borderRadius: "2rem",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow:
                              "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0,0,0,0.5)",
                          }}
                        >
                          {/* Camera */}
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#333] rounded-full"></div>

                          {/* Screen Content */}
                          <div
                            className="absolute bg-white overflow-hidden"
                            style={{
                              width: tabletSize.width,
                              height: tabletSize.height,
                              top: "12px",
                              left: "12px",
                              borderRadius: "1.5rem",
                            }}
                          >
                            <div className="relative w-full h-full bg-white">
                              <iframe
                                key={`tablet-${screen.id}-${refreshKey}`}
                                ref={(c) => {
                                  if (c) {
                                    iframeRefs.current.set(screen.id, c);
                                    if (isPrimaryScreen) {
                                      webPreviewRef.current =
                                        c.contentWindow ?? null;
                                    }
                                  } else {
                                    iframeRefs.current.delete(screen.id);
                                  }
                                }}
                                className="w-full h-full"
                                style={{
                                  // Disable pointer events during any resize so mouse events reach the document
                                  pointerEvents:
                                    isResizingMobile ||
                                    isResizingWebFrame ||
                                    isResizingTerminal
                                      ? "none"
                                      : "auto",
                                }}
                                title="Tablet Preview"
                                aria-label={`Tablet Preview ${screen.path}`}
                                src={iframeSrc}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                                allow="microphone; camera;"
                                onLoad={handleIframeLoad}
                                onError={handleIframeError}
                              />
                              {isIframeLoading && (
                                <ConnectionLoadingOverlay mode="mobile" />
                              )}
                              {iframeError && (
                                <ConnectionErrorOverlay mode="mobile" />
                              )}
                            </div>
                          </div>

                          {/* Home Button */}
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 border border-white/20 rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      // Helper to resolve iframe src with path
      const resolveWebIframeSrc = (basePath: string) => {
        return resolveIframeSrc(viewing_url, basePath);
      };

      const showWebMultiScreen = webScreens.length > 0;
      const showWebControls = showWebMultiScreen && !isReadOnlyView;

      return (
        <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-background p-4">
          {/* Floating Add Screen Button */}
          {showWebControls && webGridLayout.showAddButton && (
            <div className="absolute top-3 right-3 z-20">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddWebScreen}
                className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                title="Add another web screen"
                disabled={!viewing_url}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Web Screens Grid */}
          <div
            className={cn(
              "gap-4 h-full relative w-full",
              !showWebMultiScreen || isNarrowViewport || webScreens.length === 1
                ? "flex flex-col"
                : "grid",
              // Center single screen when manually resized or in mobile size mode
              !showWebMultiScreen &&
                hasManuallyResizedWebFrame &&
                "items-start justify-center",
              isWebMobileSize && "items-center justify-center",
              isWebFullScreen && "items-center justify-center",
            )}
            style={{
              gridTemplateColumns:
                !showWebMultiScreen ||
                isNarrowViewport ||
                isWebMobileSize ||
                isWebFullScreen
                  ? "1fr"
                  : webGridLayout.gridTemplate,
            }}
          >
            {(showWebMultiScreen ? webScreens : [{ id: 0, path: "/" }]).map(
              (screen) => {
                const iframeSrc = resolveWebIframeSrc(screen.path);
                const showScreenControls =
                  showWebMultiScreen && webScreens.length > 1;
                // For single screen, enable resize. For multi-screen, only enable if not in narrow viewport
                const enableResize =
                  !isReadOnlyView && (!showWebMultiScreen || !isNarrowViewport);

                // Mobile size dimensions for web view (iPhone 14 Pro dimensions)
                const webMobileSizeWidth = 393;
                const webMobileSizeHeight = 852;

                return (
                  <div
                    key={`web-screen-${screen.id}`}
                    className={cn(
                      "bg-accent rounded-xl border border-border overflow-hidden shadow-sm flex flex-col relative transition-all duration-300 min-w-0",
                      isWebMobileSize && !isWebFullScreen && "mx-auto",
                      isWebFullScreen &&
                        "absolute inset-4 z-50 mx-auto shadow-2xl",
                    )}
                    style={{
                      // Full-screen mode takes priority
                      ...(isWebFullScreen
                        ? isWebMobileSize
                          ? {
                              // Full-screen + mobile size: centered mobile width, full height
                              width: webMobileSizeWidth,
                              maxWidth: "100%",
                              inset: "1rem auto",
                              left: "50%",
                              transform: "translateX(-50%)",
                            }
                          : {
                              // Full-screen only: fill the area
                            }
                        : isWebMobileSize
                          ? {
                              // Mobile size only: constrained dimensions
                              width: webMobileSizeWidth,
                              height: webMobileSizeHeight,
                              maxWidth: "100%",
                            }
                          : showWebMultiScreen && webScreens.length > 1
                            ? {
                                // Multiple screens: use minHeight for grid layout
                                minHeight: webFrameHeight,
                              }
                            : showWebMultiScreen && webScreens.length === 1
                              ? {
                                  // Single screen in grid mode: fill container
                                  height: "100%",
                                  maxWidth: "100%",
                                }
                              : hasManuallyResizedWebFrame
                                ? {
                                    width: webFrameWidth ?? undefined,
                                    height: webFrameHeight,
                                    maxWidth: "100%",
                                  }
                                : {
                                    height: "100%",
                                  }),
                    }}
                  >
                    {/* Browser Header */}
                    <div className="bg-accent border-b border-border px-4 py-2.5 flex items-center gap-4 min-w-0 overflow-hidden">
                      {/* Traffic Lights */}
                      <div className="flex space-x-1.5">
                        {showScreenControls && webScreens.length > 1 ? (
                          <button
                            className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:border-red-500 transition-colors flex items-center justify-center group"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveWebScreen(screen.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            aria-label="Close screen"
                          >
                            <X
                              className="w-1.5 h-1.5 text-transparent group-hover:text-white"
                              strokeWidth={3}
                            />
                          </button>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                        )}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  "w-2.5 h-2.5 rounded-full transition-colors",
                                  isWebMobileSize
                                    ? "bg-amber-500 border border-amber-500"
                                    : "bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500 hover:border-amber-500",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsWebMobileSize(!isWebMobileSize);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                aria-label={
                                  isWebMobileSize
                                    ? "Switch to desktop size"
                                    : "Switch to mobile size"
                                }
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {isWebMobileSize
                                  ? "Desktop size"
                                  : "Mobile size"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  "w-2.5 h-2.5 rounded-full transition-colors",
                                  isWebFullScreen
                                    ? "bg-emerald-500 border border-emerald-500"
                                    : "bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500 hover:border-emerald-500",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsWebFullScreen(!isWebFullScreen);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                aria-label={
                                  isWebFullScreen
                                    ? "Exit full screen"
                                    : "Full screen"
                                }
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {isWebFullScreen
                                  ? "Exit full screen"
                                  : "Full screen"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* URL Bar */}
                      <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
                        {showWebControls && !isReadOnlyView ? (
                          <Popover
                            open={editingWebScreenId === screen.id}
                            onOpenChange={(open) => {
                              if (open) {
                                handleWebBadgeClick(screen.id, screen.path);
                              } else {
                                handleCancelWebEdit();
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <div className="h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center w-full max-w-[400px] cursor-pointer hover:border-muted-foreground/50">
                                <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                                  {stripTokenFromPath(screen.path) || "/"}
                                </span>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-56 p-0"
                              align="center"
                              sideOffset={8}
                            >
                              {availableRoutes.length > 0 && (
                                <div className="max-h-48 overflow-y-auto">
                                  <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                    Available Routes
                                  </div>
                                  {availableRoutes.map((item) => (
                                    <button
                                      key={item.route}
                                      onClick={() => {
                                        const normalized = stripTokenFromPath(
                                          normalizePath(item.route),
                                        );
                                        setWebScreens((prev) =>
                                          prev.map((s) =>
                                            s.id === screen.id
                                              ? { ...s, path: normalized }
                                              : s,
                                          ),
                                        );
                                        setEditingWebScreenId(null);
                                        setTempPath("");
                                      }}
                                      className={cn(
                                        "flex items-center justify-between w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                                        screen.path === item.route
                                          ? "text-foreground bg-accent/50"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      <span className="font-mono">
                                        {item.route}
                                      </span>
                                      {item.group && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground border border-border">
                                          {item.group}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="border-t border-border p-2">
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={tempPath}
                                    onChange={(e) =>
                                      handlePathInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleConfirmWebPathChange(screen.id);
                                      } else if (e.key === "Escape") {
                                        handleCancelWebEdit();
                                      }
                                    }}
                                    className="h-7 text-xs font-mono border-border"
                                    placeholder="Custom path..."
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                    onClick={() =>
                                      handleConfirmWebPathChange(screen.id)
                                    }
                                    aria-label="Go to path"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center w-full max-w-[400px]">
                            <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                              {stripTokenFromPath(screen.path) || "/"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Screen Controls */}
                      {showWebControls && showScreenControls ? (
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label="Screen actions"
                              >
                                <MoreVertical className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 bg-accent border-border text-foreground"
                            >
                              <DropdownMenuItem
                                onClick={() => refreshWebScreen(screen.id)}
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <RefreshCw className="w-4 h-4 mr-2 opacity-70" />
                                Refresh
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-border" />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "redesign",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                                Redesign this screen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "suggest-improvements",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
                                Suggest improvements
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "copy-alternatives",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Type className="w-4 h-4 mr-2 text-blue-400" />
                                Generate copy alternatives
                              </DropdownMenuItem>
                              {webScreens.length > 1 && (
                                <>
                                  <DropdownMenuSeparator className="bg-border" />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleRemoveWebScreen(screen.id)
                                    }
                                    className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-sm cursor-pointer"
                                  >
                                    <X className="w-4 h-4 mr-2 opacity-70" />
                                    Remove screen
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <div className="w-10"></div>
                      )}
                    </div>

                    {/* Iframe Content */}
                    <div
                      className="relative w-full flex-1 bg-white group/web-iframe"
                      style={{
                        minHeight: showWebMultiScreen
                          ? webFrameHeight - 60
                          : undefined,
                      }}
                    >
                      {/* Floating AI actions overlay for single-screen web view */}
                      {!isReadOnlyView && !showScreenControls && (
                        <div className="absolute top-3 right-3 z-30 opacity-0 group-hover/web-iframe:opacity-100 transition-opacity duration-200">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="h-7 w-7 rounded-lg bg-background/80 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
                                aria-label="AI Actions"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 bg-accent border-border text-foreground"
                            >
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "redesign",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                                Redesign this screen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "suggest-improvements",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
                                Suggest improvements
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleScreenAIAction(
                                    screen.id,
                                    screen.path,
                                    "copy-alternatives",
                                  )
                                }
                                className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                              >
                                <Type className="w-4 h-4 mr-2 text-blue-400" />
                                Generate copy alternatives
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                      <iframe
                        key={`web-${screen.id}-${refreshKey}`}
                        ref={(c) => {
                          if (showWebMultiScreen) {
                            if (c) {
                              webIframeRefs.current.set(screen.id, c);
                            } else {
                              webIframeRefs.current.delete(screen.id);
                            }
                          } else {
                            webPreviewRef.current = c?.contentWindow ?? null;
                          }
                        }}
                        className="w-full h-full"
                        style={{
                          zoom: webScaleFactor,
                          transformOrigin: "top left",
                          // Disable pointer events during any resize so mouse events reach the document
                          pointerEvents:
                            isResizingMobile ||
                            isResizingWebFrame ||
                            isResizingTerminal
                              ? "none"
                              : "auto",
                        }}
                        title={`Web Preview ${screen.path}`}
                        src={iframeSrc}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                        allow="microphone; camera;"
                        onLoad={handleIframeLoad}
                        onError={handleIframeError}
                      />
                      {isIframeLoading && (
                        <ConnectionLoadingOverlay mode="web" />
                      )}
                      {iframeError && <ConnectionErrorOverlay mode="web" />}
                    </div>

                    {/* Corner Resize Handle - window-style resize */}
                    {enableResize && (
                      <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10 group"
                        onMouseDown={(e) => {
                          const screenEl = e.currentTarget.closest(
                            '[class*="bg-accent rounded-xl"]',
                          ) as HTMLElement;
                          handleWebFrameCornerResize(e, screenEl);
                        }}
                      >
                        {/* Resize grip indicator */}
                        <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex flex-col gap-[2px]">
                            <div className="flex gap-[2px] justify-end">
                              <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            </div>
                            <div className="flex gap-[2px] justify-end">
                              <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                              <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-background">
        {/* Mobile Toolbar */}
        {showToolbar && isMobileLayout && (
          <div className="z-30 bg-background/80 backdrop-blur-xl sticky top-0 px-3 py-2 border-b border-border">
            <div className="flex items-center justify-between">
              {/* Left: Preview/Code toggle */}
              {!isReadOnlyView && (
                <div className="flex items-center gap-2">
                  <div className="bg-accent p-1 rounded-lg border border-border flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePreviewToggle(true)}
                      className={cn(
                        "h-7 w-7 rounded-md transition-all",
                        isPreviewView
                          ? "bg-white text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      )}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePreviewToggle(false)}
                      className={cn(
                        "h-7 w-7 rounded-md transition-all",
                        !isPreviewView
                          ? "bg-white text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      )}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <ConnectionStatusIndicator />
                </div>
              )}
              {isReadOnlyView && <div />}

              {/* Right: Ellipsis menu button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(true)}
                className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Actions Bottom Sheet */}
        <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <DrawerContent className="bg-background border-border">
            <DrawerHeader className="border-b border-border">
              <DrawerTitle className="text-foreground">Actions</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-1 max-h-[70vh] overflow-y-auto">
              {/* Primary Actions */}
              {!isReadOnlyView && (
                <>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                    onClick={() => {
                      handleOpenProjectSettings("share", "mobile_menu_share");
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={!prototypeId}
                  >
                    <Share2 className="w-5 h-5 text-muted-foreground" />
                    <span>Share</span>
                  </button>
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left",
                      "hover:bg-accent text-foreground",
                    )}
                    onClick={() => {
                      handleOpenProjectSettings("deploy", "mobile_menu_deploy");
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={isDeploying || !prototypeId}
                  >
                    {isDeploying ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Rocket className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span>{deploymentUrl ? "Live" : "Deploy"}</span>
                  </button>
                  {isWebFramework ? (
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                      onClick={() => {
                        handleOpenBrowserPreview("mobile_menu");
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={!viewing_url}
                    >
                      <ExternalLink className="w-5 h-5 text-muted-foreground" />
                      <span>Open in Browser</span>
                    </button>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                      onClick={() => {
                        handleOpenViewOnDevice("mobile_menu");
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={!viewing_url}
                    >
                      <QrCode className="w-5 h-5 text-muted-foreground" />
                      <span>View on Device</span>
                    </button>
                  )}
                </>
              )}

              {/* Device Mode Section */}
              {!isReadOnlyView && isPreviewView && !isCanvasPreviewEnabled && (
                <>
                  <div className="h-px bg-border my-2" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-3 py-2">
                    Device Mode
                  </p>
                  <div className="flex gap-2 px-3">
                    <Button
                      variant={previewMode === "mobile" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        handleModeChange("mobile");
                      }}
                      className={cn(
                        "flex-1",
                        previewMode === "mobile" && "bg-white text-black",
                      )}
                    >
                      <Smartphone className="w-4 h-4 mr-2" />
                      Mobile
                    </Button>
                    <Button
                      variant={previewMode === "tablet" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        handleModeChange("tablet");
                      }}
                      className={cn(
                        "flex-1",
                        previewMode === "tablet" && "bg-white text-black",
                      )}
                    >
                      <Tablet className="w-4 h-4 mr-2" />
                      Tablet
                    </Button>
                    <Button
                      variant={previewMode === "web" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        handleModeChange("web");
                      }}
                      className={cn(
                        "flex-1",
                        previewMode === "web" && "bg-white text-black",
                      )}
                    >
                      <Monitor className="w-4 h-4 mr-2" />
                      Desktop
                    </Button>
                  </div>
                </>
              )}

              {/* Tools Section */}
              {!isReadOnlyView && (
                <>
                  <div className="h-px bg-border my-2" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-3 py-2">
                    Tools
                  </p>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                    onClick={() => {
                      setIsTerminalOpen(!isTerminalOpen);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <TerminalIcon className="w-5 h-5 text-muted-foreground" />
                    <span>
                      {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
                    </span>
                  </button>
                  {!isPreviewView && (
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                      onClick={() => {
                        handleExport();
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={isExporting}
                    >
                      {isExporting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span>{isExporting ? "Exporting..." : "Export"}</span>
                    </button>
                  )}
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                    onClick={() => {
                      handleRestartDevServer();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={!prototypeId || isRestartingDevServer}
                  >
                    {isRestartingDevServer ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span>
                      {isRestartingDevServer
                        ? "Restarting..."
                        : "Restart Dev Server"}
                    </span>
                  </button>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                    onClick={() => {
                      handleBuildAndDeploy();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={!sandbox_url || !prototypeId || isBuilding}
                  >
                    {isBuilding ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Hammer className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span>{isBuilding ? "Building..." : "Build"}</span>
                  </button>
                </>
              )}

              {/* Settings Section */}
              {!isReadOnlyView && (
                <>
                  <div className="h-px bg-border my-2" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-3 py-2">
                    Settings
                  </p>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                    onClick={() => {
                      handleOpenProjectSettings(
                        "details",
                        "mobile_menu_settings",
                      );
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={!prototypeId}
                  >
                    <Settings className="w-5 h-5 text-muted-foreground" />
                    <span>Project Settings</span>
                  </button>
                  {ENABLE_DESIGN_SYSTEM &&
                    designSystemLabel &&
                    onDesignSystemClick && (
                      <button
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                        onClick={() => {
                          onDesignSystemClick();
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <Palette className="w-5 h-5 text-muted-foreground" />
                        <span>Design System</span>
                      </button>
                    )}
                  {onClone && (
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-foreground text-left"
                      onClick={() => {
                        onClone();
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={isCloningPrototype}
                    >
                      {isCloningPrototype ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Copy className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span>{isCloningPrototype ? "Cloning..." : "Clone"}</span>
                    </button>
                  )}
                </>
              )}

              {/* Destructive Actions */}
              {onResetToDefault && (
                <>
                  <div className="h-px bg-border my-2" />
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-500/10 text-red-400 text-left"
                    onClick={() => {
                      onResetToDefault();
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>Reset to Default</span>
                  </button>
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>

        {/* Desktop Toolbar */}
        {showToolbar && !isMobileLayout && (
          <div
            className={cn(
              "z-30 bg-background/80 backdrop-blur-xl transition-all duration-300",
              isWebFullScreen && previewMode === "web"
                ? "absolute top-4 right-4 px-3 py-2 rounded-xl border border-border shadow-lg"
                : "sticky top-0 px-4 py-3 border-b border-border",
            )}
          >
            <div
              className={cn(
                "flex flex-wrap items-center gap-3",
                isWebFullScreen && previewMode === "web"
                  ? "justify-end"
                  : "justify-between",
              )}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Expand Chat Button - shown when chat is collapsed */}
                {isChatCollapsed && onExpandChat && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={onExpandChat}
                          className="h-8 w-8 rounded-lg bg-accent text-muted-foreground hover:text-foreground hover:bg-accent/80 border border-border"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Open Chat</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Other toggles only shown when not in full screen */}
                {!(isWebFullScreen && previewMode === "web") && (
                  <>
                    {!isReadOnlyView && (
                      <>
                        <div className="bg-accent p-1 rounded-lg border border-border flex items-center gap-1">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handlePreviewToggle(true)}
                                  className={cn(
                                    "h-7 w-7 rounded-md transition-all",
                                    isPreviewView
                                      ? "bg-white text-black shadow-sm"
                                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                  )}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Preview</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handlePreviewToggle(false)}
                                  className={cn(
                                    "h-7 w-7 rounded-md transition-all",
                                    !isPreviewView
                                      ? "bg-white text-black shadow-sm"
                                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                  )}
                                >
                                  <Code2 className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Code</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        <div className="h-4 w-px bg-border mx-1" />

                        <ConnectionStatusIndicator />

                        {/* Device Type Toggle - only show in preview view when canvas mode is disabled */}
                        {isPreviewView && !isCanvasPreviewEnabled && (
                          <>
                            <div className="h-4 w-px bg-border mx-1" />
                            <div className="bg-accent p-1 rounded-lg border border-border flex items-center gap-0.5">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleModeChange("mobile")}
                                      className={cn(
                                        "h-7 w-7 rounded-md transition-all",
                                        previewMode === "mobile"
                                          ? "bg-white text-black shadow-sm"
                                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                      )}
                                    >
                                      <Smartphone className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Mobile</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleModeChange("tablet")}
                                      className={cn(
                                        "h-7 w-7 rounded-md transition-all",
                                        previewMode === "tablet"
                                          ? "bg-white text-black shadow-sm"
                                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                      )}
                                    >
                                      <Tablet className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Tablet</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleModeChange("web")}
                                      className={cn(
                                        "h-7 w-7 rounded-md transition-all",
                                        previewMode === "web"
                                          ? "bg-white text-black shadow-sm"
                                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                      )}
                                    >
                                      <Monitor className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Desktop</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </>
                        )}

                        {mobileHint && isMobileLayout && (
                          <span className="text-xs text-muted-foreground animate-pulse">
                            {mobileHint}
                          </span>
                        )}
                      </>
                    )}
                    {canEditScreensInPublicView && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border border-warning/30 rounded-full text-foreground text-xs font-medium">
                        <Pencil className="w-3 h-3 text-warning" />
                        Editing public view
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {/* Browser/Device - Icon only, always visible */}
                {!isReadOnlyView &&
                  (isWebFramework ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleOpenBrowserPreview("toolbar_button")
                            }
                            className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                            disabled={!viewing_url}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Open in browser</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleOpenViewOnDevice("toolbar_button")
                            }
                            className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                            disabled={!viewing_url}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View on device</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}

                {/* Cloud Integrations (Supabase) */}
                {!isReadOnlyView && (
                  <CloudIntegrationsDropdown
                    prototypeId={prototypeId}
                    normalizedSandboxUrl={sandbox_url}
                    onOpenTeamSettings={onOpenTeamSettings}
                  />
                )}

                {/* GitHub - Icon only, always visible */}
                {!isReadOnlyView && (
                  <DropdownMenu
                    open={isGithubDropdownOpen}
                    onOpenChange={setIsGithubDropdownOpen}
                  >
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
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>GitHub integration</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent
                      align="end"
                      className="w-80 bg-accent border-border text-foreground p-4"
                    >
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">
                          GitHub
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Sync your project 2-way with GitHub to collaborate at
                          source.
                        </p>

                        {githubRepoError && (
                          <Alert className="border-rose-500/20 bg-rose-500/10">
                            <AlertDescription className="text-xs text-rose-600 dark:text-rose-400">
                              {githubRepoError}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Show alert if user doesn't have permission */}
                        {!githubIntegration.connected &&
                          !githubRepository.html_url &&
                          currentUserMembership?.role !== "admin" &&
                          currentUserMembership?.role !== "owner" && (
                            <Alert className="border-warning/30 bg-warning/10">
                              <AlertDescription className="text-xs text-foreground">
                                Please reach out to a team admin to connect a
                                GitHub account first.
                              </AlertDescription>
                            </Alert>
                          )}

                        {githubIntegration.connected &&
                          !githubRepository.html_url &&
                          currentUserMembership?.role === "viewer" && (
                            <Alert className="border-warning/30 bg-warning/10">
                              <AlertDescription className="text-xs text-foreground">
                                You need edit permissions to create a GitHub
                                repository for this project.
                              </AlertDescription>
                            </Alert>
                          )}

                        {githubRepository.html_url &&
                          currentUserMembership?.role === "viewer" && (
                            <Alert className="border-warning/30 bg-warning/10">
                              <AlertDescription className="text-xs text-foreground">
                                You don&apos;t have permission to access this
                                repository.
                              </AlertDescription>
                            </Alert>
                          )}

                        <Button
                          className="w-full bg-white text-black hover:bg-white/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          size="sm"
                          disabled={
                            githubIntegration.loading ||
                            githubRepository.loading ||
                            (!githubIntegration.connected &&
                              currentUserMembership?.role !== "admin" &&
                              currentUserMembership?.role !== "owner") ||
                            (githubIntegration.connected &&
                              !githubRepository.html_url &&
                              currentUserMembership?.role === "viewer") ||
                            (!!githubRepository.html_url &&
                              currentUserMembership?.role === "viewer")
                          }
                          onClick={() => {
                            if (githubRepository.html_url) {
                              // Open GitHub repository in new tab
                              window.open(
                                githubRepository.html_url,
                                "_blank",
                                "noopener,noreferrer",
                              );
                              setIsGithubDropdownOpen(false);
                            } else if (
                              githubIntegration.connected &&
                              currentUserMembership?.role !== "viewer"
                            ) {
                              // Create GitHub repository and connect to sandbox
                              handleCreateGitHubRepository();
                            } else if (
                              !githubIntegration.connected &&
                              (currentUserMembership?.role === "admin" ||
                                currentUserMembership?.role === "owner")
                            ) {
                              // Navigate to dashboard with githubConnected param to open settings dialog
                              window.location.href =
                                "/dashboard?githubConnected=true";
                            } else {
                              // This shouldn't happen due to button disabled state
                              setIsGithubDropdownOpen(false);
                            }
                          }}
                        >
                          <svg
                            className="w-4 h-4 mr-2"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                          </svg>
                          {githubIntegration.loading || githubRepository.loading
                            ? "Loading..."
                            : githubRepository.html_url
                              ? "View Repository"
                              : githubIntegration.connected &&
                                  currentUserMembership?.role !== "viewer"
                                ? "Create Repository For Project"
                                : "Connect GitHub"}
                        </Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Share Button - NEW */}
                {!isReadOnlyView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleOpenProjectSettings("share", "toolbar_share")
                    }
                    disabled={!prototypeId}
                    className="h-8 px-3 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="Share project"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* Deploy Button - Primary CTA */}
                {!isReadOnlyView && (
                  <Button
                    size="sm"
                    onClick={() =>
                      handleOpenProjectSettings("deploy", "toolbar_deploy")
                    }
                    disabled={isDeploying || !prototypeId}
                    className={cn(
                      "h-8 px-3 text-xs font-semibold shadow-sm",
                      deploymentUrl
                        ? "bg-success hover:bg-success/90 text-success-foreground"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground",
                    )}
                  >
                    {isDeploying ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Rocket className="w-3.5 h-3.5 mr-1" />
                    )}
                    {deploymentUrl ? "Live" : "Deploy"}
                  </Button>
                )}

                {/* Project Settings - Icon only, next to More */}
                {!isReadOnlyView && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleOpenProjectSettings("details", "toolbar_gear")
                          }
                          className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                          disabled={!prototypeId}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Project settings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {/* More Menu - Overflow actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                      title="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 bg-accent border-border text-foreground"
                  >
                    {/* Terminal - moved from main toolbar */}
                    {!isReadOnlyView && (
                      <DropdownMenuItem
                        onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <TerminalIcon className="w-4 h-4 mr-2 opacity-70" />
                        {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
                      </DropdownMenuItem>
                    )}

                    {/* Export - moved from main toolbar */}
                    {!isReadOnlyView && !isPreviewView && (
                      <DropdownMenuItem
                        onClick={handleExport}
                        disabled={isExporting}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isExporting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isExporting ? "Exporting..." : "Export"}
                      </DropdownMenuItem>
                    )}

                    {/* Design System */}
                    {ENABLE_DESIGN_SYSTEM &&
                      designSystemLabel &&
                      onDesignSystemClick && (
                        <>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            onClick={onDesignSystemClick}
                            className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                          >
                            <Palette className="w-4 h-4 mr-2 opacity-70" />
                            Change design system
                          </DropdownMenuItem>
                        </>
                      )}

                    {/* Advanced Actions */}
                    {!isReadOnlyView && (
                      <>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          onClick={handleRestartDevServer}
                          disabled={!prototypeId || isRestartingDevServer}
                          className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                        >
                          {isRestartingDevServer ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2 opacity-70" />
                          )}
                          {isRestartingDevServer
                            ? "Restarting..."
                            : "Restart Dev Server"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleBuildAndDeploy}
                          disabled={!sandbox_url || !prototypeId || isBuilding}
                          className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                        >
                          {isBuilding ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Hammer className="w-4 h-4 mr-2 opacity-70" />
                          )}
                          {isBuilding ? "Building..." : "Build"}
                        </DropdownMenuItem>
                      </>
                    )}
                    {onClone && (
                      <>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          onClick={onClone}
                          disabled={isCloningPrototype}
                          className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                        >
                          {isCloningPrototype ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4 mr-2 opacity-70" />
                          )}
                          {isCloningPrototype ? "Cloning..." : "Clone"}
                        </DropdownMenuItem>
                      </>
                    )}
                    {onResetToDefault && (
                      <>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          onClick={onResetToDefault}
                          className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-sm cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 mr-2 opacity-70" />
                          Reset to Default
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )}

        {/* Preview Area */}
        <div
          className={cn(
            "relative bg-background transition-all duration-300",
            isCanvasPreviewEnabled && isPreviewView
              ? "flex-1 overflow-hidden"
              : "flex items-center justify-center",
          )}
          style={{
            height:
              isTerminalOpen && !(isWebFullScreen && previewMode === "web")
                ? `calc(100% - ${terminalHeight}px)`
                : "100%",
            transition: isResizingTerminal ? "none" : "height 0.2s ease-in-out",
          }}
        >
          {/* Floating controls - top right of preview */}
          {!isReadOnlyView && isPreviewView && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              {/* Layout mode toggle - only when canvas feature flag is on */}
              {isCanvasPreviewEnabled && (
                <div className="flex items-center bg-accent border border-border rounded-lg p-0.5">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCanvasLayoutMode("grid")}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            canvasLayoutMode === "grid"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          aria-label="Grid layout"
                          aria-pressed={canvasLayoutMode === "grid"}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Grid layout</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCanvasLayoutMode("freeform")}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            canvasLayoutMode === "freeform"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          aria-label="Canvas layout"
                          aria-pressed={canvasLayoutMode === "freeform"}
                        >
                          <Move className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Canvas layout</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              {/* Add Screen button */}
              {(isCanvasPreviewEnabled
                ? canvasLayoutMode === "freeform"
                : previewMode === "mobile") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    isCanvasPreviewEnabled && canvasLayoutMode === "freeform"
                      ? handleAddCanvasScreen
                      : handleAddMobileScreen
                  }
                  className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Add another screen"
                  disabled={!viewing_url}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {isPreviewView ? (
            isCanvasPreviewEnabled && canvasLayoutMode === "freeform" ? (
              <PreviewCanvas
                ref={canvasRef}
                viewingUrl={viewing_url}
                previewMode={previewMode}
                initialScreens={
                  previewMode === "mobile"
                    ? (initialScreens || mobileScreens).map((s) => ({
                        id: s.id,
                        path: s.path,
                      }))
                    : (initialWebScreens || webScreens).map((s) => ({
                        id: s.id,
                        path: s.path,
                      }))
                }
                initialCanvasState={initialCanvasState}
                onCanvasStateChange={onCanvasStateChange}
                onScreensChange={(screens) => {
                  if (previewMode === "mobile") {
                    onScreensChange?.(
                      screens.map((s) => ({ id: s.id, path: s.path })),
                    );
                  } else {
                    onWebScreensChange?.(
                      screens.map((s) => ({ id: s.id, path: s.path })),
                    );
                  }
                }}
                readOnly={isReadOnlyView}
                availableRoutes={availableRoutes}
                onIframeLoad={handleIframeLoad}
                onIframeError={handleIframeError}
                onAIAction={handleScreenAIAction}
                onGlobalAIAction={handleGlobalAIAction}
              />
            ) : (
              renderPreviewContent()
            )
          ) : (
            <div className="h-full w-full overflow-hidden bg-accent">
              {codeView}
            </div>
          )}
        </div>

        {/* Terminal Panel - hidden in full-screen mode */}
        {!isReadOnlyView &&
          isTerminalOpen &&
          !(isWebFullScreen && previewMode === "web") && (
            <div
              className="relative border-t border-border bg-background"
              style={{ height: `${terminalHeight}px` }}
            >
              {/* Terminal Header with Resize Handle */}
              <div
                className="absolute top-0 left-0 right-0 h-9 bg-accent border-b border-border flex items-center justify-between px-4 cursor-ns-resize hover:bg-accent/80 transition-colors group z-10"
                onMouseDown={handleTerminalResizeStart}
              >
                <div className="flex items-center gap-2">
                  <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    Terminal Output
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Drag to resize
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                    onClick={() => setIsTerminalOpen(false)}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Terminal Content */}
              <div className="absolute top-9 left-0 right-0 bottom-0 bg-background">
                <Terminal
                  className="w-full h-full"
                  baseTunnelUrl={base_tunnel_url}
                  activeSession={activeTerminalSession}
                  onSessionChange={setActiveTerminalSession}
                />
              </div>
            </div>
          )}

        {/* Project Settings Modal (unified) */}
        <ProjectSettingsModal
          open={isProjectSettingsOpen}
          onOpenChange={setIsProjectSettingsOpen}
          initialTab={projectSettingsTab}
          prototype={prototype ?? null}
          prototypeId={prototypeId}
          normalizedSandboxUrl={sandbox_url}
          onDeploySuccess={onDeploySuccess}
          onBuild={handleBuildAndDeploy}
          isBuilding={isBuilding}
          isPublic={isPublic}
          onVisibilityChange={onVisibilityChange}
          userPlan={userPlan}
          framework={framework}
          onNameChange={onNameChange}
          canEditName={canEditName}
          githubIntegration={githubIntegration}
          githubRepository={githubRepository}
          onCreateGitHubRepository={handleCreateGitHubRepository}
          canManageGithub={canManageGithub}
        />

        {/* View on Device Modal */}
        <ViewOnDeviceModal
          isOpen={isQRModalOpen}
          onOpenChange={setIsQRModalOpen}
          viewing_url={viewing_url}
          currentRenderStatus={currentRenderStatus}
        />
      </div>
    );
  },
);

MaterializeRenderSection.displayName = "MaterializeRenderSection";

export default MaterializeRenderSection;
