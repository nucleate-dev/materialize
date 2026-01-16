"use client";

import { supabase } from "@/ClientConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  Loader2,
  Maximize,
  MessageSquare,
  Monitor,
  MoreVertical,
  Palette,
  PanelLeftOpen,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCcw,
  Settings,
  Smartphone,
  Terminal as TerminalIcon,
  X,
  Zap,
  ZoomIn,
  ZoomOut
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

// Dynamically import Terminal to avoid SSR issues with xterm
const Terminal = dynamic(() => import("./Terminal"), { ssr: false });

// Import the Project Settings Modal (unified modal)
import {
  ProjectSettingsModal,
  type ProjectSettingsTab,
} from "./ProjectSettingsModal";
// Import the View on Device Modal
import {
  BuildAndDeployResponse,
  PublicDevServerRestartSuccessResponse,
} from "@/lib/types/SandboxAPITypes";
import { ViewOnDeviceModal } from "./ViewOnDeviceModal";

// Import PreviewCanvas for infinite canvas mode
import type { CanvasStateData, PreviewCanvasRef } from "./canvas";
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

const resolveDisplayUrl = (baseUrl: string, path: string) => {
  if (!baseUrl) {
    return "";
  }

  try {
    const base = new URL(stripTokenFromUrl(baseUrl));
    const normalizedPath = stripTokenFromPath(path);
    return new URL(normalizedPath || "/", base).toString();
  } catch {
    return stripTokenFromUrl(baseUrl);
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
  onViewingUrlUpdate?: (url: string) => void;
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
  onVisibilityChange?: (isPublic: boolean) => void;
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
  onPreviewModeChange?: (mode: "mobile" | "web") => void;
  // Canvas mode props (infinite canvas like Figma)
  initialCanvasState?: CanvasStateData;
  onCanvasStateChange?: (state: CanvasStateData) => void;
  // Chat panel collapse state
  isChatCollapsed?: boolean;
  onExpandChat?: () => void;
}

export interface MaterializeRenderSectionRef {
  forceRefresh: () => void;
  updateScreens: (data: ScreenUpdateData) => void;
}

type PreviewMode = "web" | "mobile";

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
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();
    const posthog = usePostHog();
    const { activeTeam, currentUserMembership } = useActiveTeam();

    // Check if multi-screen feature is enabled
    const isMultiScreenEnabled =
      posthog?.isFeatureEnabled("multiple-frames-view") ?? false;

    // Check if GitHub integration is enabled
    const isGithubIntegrationEnabled =
      posthog?.isFeatureEnabled("github-integration") ?? false;

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
        if (!activeTeam?.id || !isGithubIntegrationEnabled) {
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
    }, [activeTeam?.id, isGithubIntegrationEnabled, logger]);

    // Fetch GitHub repository for this prototype
    useEffect(() => {
      const fetchGithubRepository = async () => {
        if (!prototypeId || !isGithubIntegrationEnabled) {
          setGithubRepository({ html_url: null, loading: false });
          return;
        }

        try {
          const { data, error } = await supabase
            .from("github_repositories")
            .select("html_url")
            .eq("prototype_id", prototypeId)
            .maybeSingle();

          if (error) {
            logger.debug("error", "Failed to fetch GitHub repository", {
              error,
            });
            setGithubRepository({ html_url: null, loading: false });
            return;
          }

          setGithubRepository({
            html_url: data?.html_url ?? null,
            loading: false,
          });
        } catch (error) {
          logger.debug("error", "Error checking GitHub repository", { error });
          setGithubRepository({ html_url: null, loading: false });
        }
      };

      fetchGithubRepository();
    }, [prototypeId, isGithubIntegrationEnabled, logger]);

    // Check if canvas preview mode is enabled (infinite canvas like Figma)
    const isCanvasPreviewEnabled = posthog?.isFeatureEnabled("canvas-preview-mode") ?? false;

    // Canvas ref for infinite canvas mode
    const canvasRef = useRef<PreviewCanvasRef>(null);

    // Zoom state for canvas mode
    const [canvasZoom, setCanvasZoom] = useState(1);

    // Determine if this is a web-only framework
    const isWebFramework = framework === "web_nextjs_react";

    const [previewMode, setPreviewMode] = useState<PreviewMode>(
      isWebFramework ? "web" : "mobile",
    );
    const [refreshKey, setRefreshKey] = useState(0);

    // Update preview mode when framework changes to web
    useEffect(() => {
      if (isWebFramework && previewMode === "mobile") {
        setPreviewMode("web");
      }
    }, [isWebFramework, previewMode]);

    // Notify parent when preview mode changes
    useEffect(() => {
      onPreviewModeChange?.(previewMode);
    }, [previewMode, onPreviewModeChange]);
    const [mobileSize, setMobileSize] = useState({ width: 320, height: 640 });
    const [hasManuallyResized, setHasManuallyResized] = useState(false);

    // Calculate responsive mobile size based on viewport height and width
    useEffect(() => {
      const calculateSize = () => {
        if (hasManuallyResized) return;

        const vh = window.innerHeight;
        const vw = window.innerWidth;

        // UI overhead for header, padding, etc
        const uiOverhead = 120;
        const availableHeight = Math.max(0, vh - uiOverhead);

        // Standard phone aspect ratio (width / height)
        const aspectRatio = 320 / 640;

        // Calculate size based on available height (use 85% to leave some breathing room)
        let newHeight = availableHeight * 0.85;

        // Also consider viewport width to ensure phone fits horizontally
        // Account for padding/margins (100px total) and phone frame border (16px)
        const maxHeightBasedOnWidth = (vw - 116) / aspectRatio;

        // Use the smaller of the two constraints
        newHeight = Math.min(newHeight, maxHeightBasedOnWidth);

        // Clamp to reasonable bounds - much smaller minimum for mobile devices
        newHeight = Math.max(300, newHeight); // Minimum 300px instead of 640px
        newHeight = Math.min(1000, newHeight); // Maximum 1000px

        const newWidth = newHeight * aspectRatio;

        setMobileSize({ width: newWidth, height: newHeight });
      };

      // Calculate on mount and resize
      calculateSize();
      window.addEventListener("resize", calculateSize);
      return () => window.removeEventListener("resize", calculateSize);
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

    // Calculate scaled mobile size based on number of screens when multi-screen is enabled
    const scaledMobileSize = React.useMemo(() => {
      if (!isMultiScreenEnabled || mobileScreens.length <= 1) {
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
    }, [isMultiScreenEnabled, mobileScreens.length, mobileSize]);

    // Calculate scale factor for iframe content zoom
    const mobileScaleFactor = React.useMemo(() => {
      if (!isMultiScreenEnabled || mobileScreens.length <= 1) {
        return 1;
      }
      const targetWidth = scaledMobileSize.width + 16;
      const originalWidth = mobileSize.width + 16;
      return targetWidth / originalWidth;
    }, [isMultiScreenEnabled, mobileScreens.length, scaledMobileSize, mobileSize]);

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

    // Calculate scale factor for web iframe content zoom
    const webScaleFactor = React.useMemo(() => {
      if (!isMultiScreenEnabled || webScreens.length <= 1) {
        return 1;
      }
      // Scale down based on number of screens in grid
      // 2 screens (side by side): 0.7 scale
      // 3-4 screens (2x2 grid): 0.6 scale
      if (webScreens.length === 2) {
        return 0.7;
      }
      return 0.6;
    }, [isMultiScreenEnabled, webScreens.length]);
    const webIframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

    // Web frame sizing
    const [webFrameHeight, setWebFrameHeight] = useState(500);
    const [webFrameWidth, setWebFrameWidth] = useState<number | null>(null); // null = auto (fill container)
    const [isResizingWebFrame, setIsResizingWebFrame] = useState(false);
    const [hasManuallyResizedWebFrame, setHasManuallyResizedWebFrame] = useState(false);

    // Calculate responsive web frame height based on viewport
    useEffect(() => {
      const calculateWebFrameHeight = () => {
        if (hasManuallyResizedWebFrame) return;

        const vh = window.innerHeight;
        // Account for toolbar, padding, and other UI elements
        const uiOverhead = 140;
        const availableHeight = Math.max(0, vh - uiOverhead);

        // Use 90% of available height
        let newHeight = availableHeight * 0.9;

        // Clamp to reasonable bounds
        newHeight = Math.max(400, newHeight); // Minimum reasonable height
        newHeight = Math.min(1200, newHeight); // Maximum reasonable height

        setWebFrameHeight(newHeight);
      };

      calculateWebFrameHeight();
      window.addEventListener("resize", calculateWebFrameHeight);
      return () => window.removeEventListener("resize", calculateWebFrameHeight);
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
      return { gridTemplate: "repeat(2, 1fr)", showAddButton: false }; // Max 4
    }, [webScreens.length]);

    const [editingScreenId, setEditingScreenId] = useState<number | null>(null);
    const [editingWebScreenId, setEditingWebScreenId] = useState<number | null>(
      null,
    );
    const [tempPath, setTempPath] = useState<string>("");
    const [routeSuggestions, setRouteSuggestions] = useState<
      Array<{ route: string; group?: string; }>
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

    // Mobile resize state
    const [isResizingMobile, setIsResizingMobile] = useState(false);

    // Modal states
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [isGithubDropdownOpen, setIsGithubDropdownOpen] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [projectSettingsTab, setProjectSettingsTab] =
      useState<ProjectSettingsTab>("deploy");

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

      // Warn user when adding 4+ screens
      const currentCount = mobileScreens.length;
      if (currentCount >= 4) {
        toast.warning("Performance note", {
          description:
            "Having many screens open may slow down your browser. Consider closing unused screens.",
        });
      }

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

      const currentCount = webScreens.length;
      if (currentCount >= 4) {
        toast.warning("Maximum screens reached", {
          description: "Web view supports up to 4 screens.",
        });
        return;
      }

      if (currentCount >= 3) {
        toast.warning("Performance note", {
          description: "Having many screens open may slow down your browser.",
        });
      }

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

          const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
          const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));

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

      const routes: Array<{ route: string; group?: string; }> = [];
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
          // Use canvas ref if in canvas mode
          if (isCanvasPreviewEnabled && canvasRef.current) {
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
                  canvasRef.current.setScreens(data.screens.map((s, index) => ({ id: index + 1, path: s.path })));
                }
                break;
            }
            return;
          }

          // Legacy mode - use state-based screen management
          const setScreens = previewMode === "mobile" ? setMobileScreens : setWebScreens;
          const nextIdRef = previewMode === "mobile" ? nextMobileScreenId : nextWebScreenId;

          switch (data.action) {
            case "add":
              if (data.path) {
                // Enforce max 4 screens
                const currentScreens = previewMode === "mobile" ? mobileScreens : webScreens;
                if (currentScreens.length >= 4) {
                  logger.debug("warn", "Cannot add screen: maximum of 4 screens allowed");
                  return;
                }
                setScreens((prev) => [...prev, { id: nextIdRef.current++, path: data.path! }]);
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
                // Enforce max 4 screens
                const screensToSet = data.screens.slice(0, 4);
                let idCounter = 0;
                setScreens(screensToSet.map((s) => ({ id: idCounter++, path: s.path })));
                nextIdRef.current = idCounter;
              }
              break;
          }
        },
      }),
      [forceRefresh, previewMode, mobileScreens, webScreens, logger, isCanvasPreviewEnabled],
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

      try {
        // Get authentication token
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          toast.error("Authentication required to build");
          return;
        }

        // Clear any previous error
        setBuildError(null);
        setIsBuilding(true);

        toast.info("Build started! This may take 3-5 minutes...");

        // Await the build request
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

        setIsBuilding(false);

        if (!response.ok || result.error) {
          const errorMessage =
            result.error?.message ?? "Build and deploy failed";
          setBuildError(errorMessage);
          toast.error(`Build failed: ${errorMessage}`);
          logger.debug("error", "Build and deploy failed", {
            error: errorMessage,
          });
        } else {
          setBuildError(null);
          toast.success("Build and deploy completed successfully!");
        }
      } catch (error) {
        setIsBuilding(false);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setBuildError(errorMessage);
        logger.debug("error", "Error in handleBuildAndDeploy:", {
          error: errorMessage,
        });
        toast.error(`Failed to build: ${errorMessage}`);
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

    // Canvas zoom handlers
    const handleZoomIn = useCallback(() => {
      if (canvasRef.current) {
        const currentZoom = canvasRef.current.getZoom();
        const newZoom = Math.min(currentZoom * 1.25, 4); // Max 400%
        canvasRef.current.setZoom(newZoom);
        setCanvasZoom(newZoom);
      }
    }, []);

    const handleZoomOut = useCallback(() => {
      if (canvasRef.current) {
        const currentZoom = canvasRef.current.getZoom();
        const newZoom = Math.max(currentZoom / 1.25, 0.1); // Min 10%
        canvasRef.current.setZoom(newZoom);
        setCanvasZoom(newZoom);
      }
    }, []);

    const handleZoomToFit = useCallback(() => {
      if (canvasRef.current) {
        canvasRef.current.zoomToFit();
        // Update zoom state after a short delay to get the new zoom level
        setTimeout(() => {
          if (canvasRef.current) {
            setCanvasZoom(canvasRef.current.getZoom());
          }
        }, 350);
      }
    }, []);

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
        viewing_url.includes("sandbox.nucleate.dev");
      if (isDevServer) onRenderStatusChange("Connected");
    }, [viewing_url, onRenderStatusChange]);

    const handleIframeError = useCallback(() => {
      setIsIframeLoading(false);
      setIframeError(true);
      onRenderStatusChange("Disconnected");
    }, [onRenderStatusChange]);

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
        viewing_url.includes("sandbox.nucleate.dev");
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
              className: "bg-warning/10 border border-warning/30 text-foreground",
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
              className: "bg-destructive/10 border border-destructive/30 text-destructive",
              dotClassName:
                "w-2 h-2 bg-destructive rounded-full shadow-[0_0_8px_hsl(var(--destructive)/0.6)]",
              text: "Error",
              animate: false,
            };
          case "Disconnected":
            return {
              className: "bg-destructive/10 border border-destructive/30 text-destructive",
              dotClassName:
                "w-2 h-2 bg-destructive rounded-full shadow-[0_0_8px_hsl(var(--destructive)/0.6)]",
              text: "Disconnected",
              animate: false,
            };
          case "Connected":
            return {
              className:
                "bg-success/10 border border-success/30 text-success",
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
    const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode; }) => (
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
    const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode; }) => (
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
          <div className="w-full h-full overflow-auto bg-background">
            <div className="min-h-full flex items-center justify-center">
              <div
                className={cn(
                  "flex flex-wrap justify-center gap-x-8 gap-y-12 pb-8 relative",
                  isMultiScreenEnabled && mobileScreens.length > 1 ? "pt-16" : "pt-8",
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
                        {/* URL Bar / Controls - Show when multi-screen feature is enabled */}
                        {isMultiScreenEnabled && (
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
                            {editingScreenId === screen.id &&
                              !isReadOnlyView ? (
                              <div className="flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-center gap-1 bg-accent border border-border px-1.5 py-1 rounded-lg shadow-xl">
                                  <Input
                                    value={tempPath}
                                    onChange={(e) =>
                                      handlePathInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      handlePathKeyDown(screen.id, e)
                                    }
                                    className="h-7 w-40 text-xs text-center border-0 bg-transparent focus-visible:ring-0 text-foreground px-1"
                                    placeholder="/"
                                    autoFocus
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                    onClick={() =>
                                      handleConfirmPathChange(screen.id)
                                    }
                                    aria-label="Confirm path change"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400 text-red-500/70"
                                    onClick={handleCancelEdit}
                                    aria-label="Cancel edit"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                                {routeSuggestions.length > 0 && (
                                  <div className="bg-accent border border-border rounded-lg shadow-xl overflow-hidden w-full max-h-32 overflow-y-auto">
                                    {routeSuggestions.map((item) => (
                                      <button
                                        key={item.route}
                                        onClick={() =>
                                          handleSuggestionClick(
                                            screen.id,
                                            item.route,
                                          )
                                        }
                                        className="flex items-center justify-between w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                                      >
                                        <span>{item.route}</span>
                                        {item.group && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground border border-border">
                                            {item.group}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-sm",
                                    isReadOnlyView
                                      ? "bg-accent/50 border border-border/50 text-muted-foreground/70"
                                      : "bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 cursor-pointer",
                                  )}
                                  onClick={
                                    !isReadOnlyView
                                      ? () =>
                                        handleBadgeClick(
                                          screen.id,
                                          screen.path,
                                        )
                                      : undefined
                                  }
                                >
                                  {stripTokenFromPath(screen.path) || "/"}
                                </div>
                                {!isReadOnlyView && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-accent/80 text-muted-foreground"
                                      onClick={() => refreshScreen(screen.id)}
                                      aria-label="Refresh screen"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                    </Button>
                                    {mobileScreens.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-muted-foreground"
                                        onClick={() =>
                                          handleRemoveMobileScreen(screen.id)
                                        }
                                        aria-label="Remove screen"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

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
                          {/* Dynamic Island / Notch area */}
                          <div
                            className="absolute bg-black z-20"
                            style={{
                              width: "35%",
                              height: "24px",
                              top: "8px",
                              left: "50%",
                              transform: "translateX(-50%)",
                              borderRadius: "12px",
                            }}
                          ></div>

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
                                  // Disable pointer events during resize so mouse events reach the document
                                  pointerEvents: isResizingMobile ? "none" : "auto",
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

      // Helper to resolve iframe src with path
      const resolveWebIframeSrc = (basePath: string) => {
        return resolveIframeSrc(viewing_url, basePath);
      };

      const showWebMultiScreen = isMultiScreenEnabled && webScreens.length > 0;
      const showWebControls = showWebMultiScreen && !isReadOnlyView;

      return (
        <div className="w-full h-full overflow-auto bg-background p-4">
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
                {webScreens.length < 2 && (
                  <span className="hidden md:inline text-xs font-medium ml-1">
                    Add Screen
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* Web Screens Grid */}
          <div
            className={cn(
              "gap-4 h-full",
              !showWebMultiScreen || isNarrowViewport || webScreens.length === 1
                ? "flex flex-col"
                : "grid",
              // Center single screen when manually resized
              !showWebMultiScreen && hasManuallyResizedWebFrame && "items-start justify-center",
            )}
            style={{
              gridTemplateColumns:
                !showWebMultiScreen || isNarrowViewport
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
                const enableResize = !isReadOnlyView && (!showWebMultiScreen || !isNarrowViewport);

                return (
                  <div
                    key={`web-screen-${screen.id}`}
                    className="bg-accent rounded-xl border border-border overflow-hidden shadow-sm flex flex-col relative"
                    style={{
                      // For multi-screen, use minHeight. For single-screen with manual resize, use explicit dimensions
                      ...(showWebMultiScreen ? {
                        minHeight: webFrameHeight,
                      } : hasManuallyResizedWebFrame ? {
                        width: webFrameWidth ?? undefined,
                        height: webFrameHeight,
                        maxWidth: "100%",
                      } : {
                        height: "100%",
                      }),
                    }}
                  >
                    {/* Browser Header */}
                    <div className="bg-accent border-b border-border px-4 py-2.5 flex items-center gap-4">
                      {/* Traffic Lights */}
                      <div className="flex space-x-1.5">
                        {showScreenControls && webScreens.length > 1 ? (
                          <button
                            className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:border-red-500 transition-colors flex items-center justify-center group"
                            onClick={() => handleRemoveWebScreen(screen.id)}
                            aria-label="Close screen"
                          >
                            <X className="w-1.5 h-1.5 text-transparent group-hover:text-white" strokeWidth={3} />
                          </button>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                        )}
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                      </div>

                      {/* URL Bar */}
                      <div className="flex-1 flex justify-center">
                        {editingWebScreenId === screen.id && !isReadOnlyView ? (
                          <div className="flex items-center gap-1 bg-background border border-border px-2 py-1 rounded-md">
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
                              className="h-6 w-48 text-xs border-0 bg-transparent focus-visible:ring-0 text-foreground"
                              placeholder="/"
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() =>
                                handleConfirmWebPathChange(screen.id)
                              }
                            >
                              <Check className="w-3 h-3 text-emerald-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={handleCancelWebEdit}
                            >
                              <X className="w-3 h-3 text-red-400" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center min-w-[200px] max-w-[400px]",
                              showWebControls &&
                              showScreenControls &&
                              "cursor-pointer hover:border-muted-foreground/50",
                            )}
                            onClick={
                              showWebControls && showScreenControls
                                ? () =>
                                  handleWebBadgeClick(screen.id, screen.path)
                                : undefined
                            }
                          >
                            <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                              {resolveDisplayUrl(viewing_url, screen.path)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Screen Controls */}
                      {showWebControls && showScreenControls ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => refreshWebScreen(screen.id)}
                          >
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                          </Button>
                          {webScreens.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:text-red-400"
                              onClick={() => handleRemoveWebScreen(screen.id)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="w-10"></div>
                      )}
                    </div>

                    {/* Iframe Content */}
                    <div
                      className="relative w-full flex-1 bg-white"
                      style={{
                        minHeight: showWebMultiScreen
                          ? webFrameHeight - 60
                          : undefined,
                      }}
                    >
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
                          // Disable pointer events during resize so mouse events reach the document
                          pointerEvents: isResizingWebFrame ? "none" : "auto",
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
                          const screenEl = e.currentTarget.closest('[class*="bg-accent rounded-xl"]') as HTMLElement;
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
        {/* Compact Responsive Toolbar */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl px-4 py-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: View Toggles */}
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
                        className="h-8 w-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
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

                  {/* Canvas Zoom Controls - only show when canvas mode is enabled and in preview view */}
                  {isCanvasPreviewEnabled && isPreviewView && (
                    <>
                      <div className="h-4 w-px bg-border mx-1" />
                      <div className="flex items-center gap-1 bg-accent p-1 rounded-lg border border-border">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={handleZoomOut}
                              >
                                <ZoomOut className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Zoom out</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-xs text-muted-foreground font-mono w-12 text-center">
                          {Math.round(canvasZoom * 100)}%
                        </span>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={handleZoomIn}
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Zoom in</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="h-4 w-px bg-border mx-0.5" />
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={handleZoomToFit}
                              >
                                <Maximize className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Zoom to fit</p>
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
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {!isReadOnlyView && !isPreviewView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Export project files"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-2 hidden md:inline text-xs font-medium">
                    Export
                  </span>
                </Button>
              )}
              {!isReadOnlyView &&
                (isWebFramework ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenBrowserPreview("toolbar_button")}
                    className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="Open in new tab"
                    disabled={!viewing_url}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="ml-2 hidden md:inline text-xs font-medium">
                      Browser
                    </span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenViewOnDevice("toolbar_button")}
                    className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="View on Device"
                    disabled={!viewing_url}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span className="ml-2 hidden md:inline text-xs font-medium">
                      Device
                    </span>
                  </Button>
                ))}
              {!isReadOnlyView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                  className={cn(
                    "hidden sm:flex h-8 border transition-all",
                    isTerminalOpen
                      ? "bg-white text-black border-transparent hover:bg-white/90"
                      : "bg-accent border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80",
                  )}
                  title="Toggle Terminal"
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                </Button>
              )}
              {!isReadOnlyView && isGithubIntegrationEnabled && (
                <DropdownMenu
                  open={isGithubDropdownOpen}
                  onOpenChange={setIsGithubDropdownOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                      title="GitHub integration"
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
              {/* Project Settings (Gear icon) */}
              {!isReadOnlyView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenProjectSettings("deploy", "toolbar_gear")}
                  className="h-8 w-8 p-0 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Project Settings"
                  disabled={!prototypeId}
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              )}
              {/* Deploy Button - opens modal */}
              {!isReadOnlyView && (
                <Button
                  size="sm"
                  onClick={() => handleOpenProjectSettings("deploy", "toolbar_deploy")}
                  disabled={isDeploying || !prototypeId}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold shadow-sm",
                    deploymentUrl
                      ? "bg-success hover:bg-success/90 text-white"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground",
                  )}
                >
                  {isDeploying ? (
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="w-3.5 h-3.5 mr-2" />
                  )}
                  {deploymentUrl ? "Manage deploy" : "Deploy"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 bg-accent border-border text-foreground"
                >
                  <DropdownMenuItem
                    onClick={() => handleModeChange("mobile")}
                    className={cn(
                      "focus:bg-accent/80 focus:text-foreground text-sm cursor-pointer",
                      previewMode === "mobile"
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Smartphone className="w-4 h-4 mr-2 opacity-70" />
                    Mobile View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleModeChange("web")}
                    className={cn(
                      "focus:bg-accent/80 focus:text-foreground text-sm cursor-pointer",
                      previewMode === "web"
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Monitor className="w-4 h-4 mr-2 opacity-70" />
                    Web View
                  </DropdownMenuItem>
                  {!isReadOnlyView && !isPreviewView && (
                    <>
                      <DropdownMenuSeparator className="bg-border sm:hidden" />
                      <DropdownMenuItem
                        onClick={handleExport}
                        disabled={isExporting}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isExporting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isExporting ? "Exporting..." : "Export"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {!isReadOnlyView && isWebFramework && (
                    <DropdownMenuItem
                      onClick={() => handleOpenBrowserPreview("dropdown")}
                      disabled={!viewing_url}
                      className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2 opacity-70" />
                      Browser
                    </DropdownMenuItem>
                  )}
                  {designSystemLabel && onDesignSystemClick && (
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
                  {!isReadOnlyView && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <TerminalIcon className="w-4 h-4 mr-2 opacity-70" />
                        {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenProjectSettings("deploy", "dropdown")}
                        disabled={!prototypeId}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <Settings className="w-4 h-4 mr-2 opacity-70" />
                        Project Settings
                      </DropdownMenuItem>
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

        {/* Preview Area */}
        <div
          className={cn(
            "relative bg-background transition-all duration-300",
            isCanvasPreviewEnabled && isPreviewView
              ? "flex-1 overflow-hidden"
              : "flex items-center justify-center",
          )}
          style={{
            height: isTerminalOpen
              ? `calc(100% - ${terminalHeight}px)`
              : "100%",
            transition: isResizingTerminal ? "none" : "height 0.2s ease-in-out",
          }}
        >
          {/* Floating Add Screen button - top right of canvas */};
          {!isReadOnlyView && isPreviewView && (
            isCanvasPreviewEnabled ? (
              <div className="absolute top-3 right-3 z-20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddCanvasScreen}
                  className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Add another screen"
                  disabled={!viewing_url}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden md:inline text-xs font-medium ml-1">
                    Add Screen
                  </span>
                </Button>
              </div>
            ) : isMultiScreenEnabled && previewMode === "mobile" && (
              <div className="absolute top-3 right-3 z-20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddMobileScreen}
                  className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Add another screen"
                  disabled={!viewing_url}
                >
                  <Plus className="h-3.5" />
                  <span className="hidden md:inline text-xs font-medium">
                    Add Screen
                  </span>
                </Button>
              </div>
            )
          )}
          {
            isPreviewView ? (
              isCanvasPreviewEnabled ? (
                <PreviewCanvas
                  ref={canvasRef}
                  viewingUrl={viewing_url}
                  previewMode={previewMode}
                  initialScreens={previewMode === "mobile"
                    ? (initialScreens || mobileScreens).map(s => ({ id: s.id, path: s.path }))
                    : (initialWebScreens || webScreens).map(s => ({ id: s.id, path: s.path }))
                  }
                  initialCanvasState={initialCanvasState}
                  onCanvasStateChange={onCanvasStateChange}
                  onScreensChange={(screens) => {
                    if (previewMode === "mobile") {
                      onScreensChange?.(screens.map(s => ({ id: s.id, path: s.path })));
                    } else {
                      onWebScreensChange?.(screens.map(s => ({ id: s.id, path: s.path })));
                    }
                  }}
                  readOnly={isReadOnlyView}
                  availableRoutes={availableRoutes}
                  onIframeLoad={handleIframeLoad}
                  onIframeError={handleIframeError}
                />
              ) : (
                renderPreviewContent()
              )
            ) : (
              <div className="h-full w-full overflow-hidden bg-accent">
                {codeView}
              </div>
            )
          }
        </div >

        {/* Terminal Panel */}
        {
          !isReadOnlyView && isTerminalOpen && (
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
                />
              </div>
            </div>
          )
        }

        {/* Project Settings Modal (unified) */}
        <ProjectSettingsModal
          open={isProjectSettingsOpen}
          onOpenChange={setIsProjectSettingsOpen}
          initialTab={projectSettingsTab}
          prototype={prototype ?? null}
          prototypeId={prototypeId}
          normalizedSandboxUrl={sandbox_url}
          onDeploySuccess={onDeploySuccess}
          isPublic={isPublic}
          onVisibilityChange={onVisibilityChange}
          userPlan={userPlan}
          framework={framework}
          onNameChange={onNameChange}
          canEditName={canEditName}
          isGithubIntegrationEnabled={isGithubIntegrationEnabled}
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
      </div >
    );
  },
);

MaterializeRenderSection.displayName = "MaterializeRenderSection";

export default MaterializeRenderSection;
