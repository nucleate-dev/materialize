"use client";

import { RenderStatus } from "@/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEBUG_MODE } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { ChatStreamEventType } from "@/lib/types/chat-types";
import {
  ChatErrorResponse,
  ChatRequestBody,
  CodeError,
  ChatMessage as ServerChatMessage,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  clearChatIntent,
  getChatIntent,
  setChatIntent,
} from "@/lib/utils/chatIntentUtils";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentListIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  InformationCircleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PhotoIcon,
  RocketLaunchIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import {
  type ComponentType,
  type SVGProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { useFileAutocomplete } from "@/hooks/useFileAutocomplete";
import {
  deletePrototypeImages,
  getSignedImageUrl,
  uploadChatImage,
} from "@/lib/utils/chatImageUpload";
import { FileAutocomplete } from "./FileAutocomplete";

type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];
type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string; // URL to image in Supabase Storage
}

type ConversationTimelineItem = ChatMessage & {
  id: string;
  kind: "user" | "assistant";
};

type ToolTimelineItem = {
  id: string;
  kind: "tool";
  tool: string;
  toolCallId: string;
  status: "running" | "success" | "error";
  args?: unknown;
  result?: unknown;
};

type PlanTimelineItem = {
  id: string;
  kind: "plan";
  toolCallId: string;
  plan: string[];
};

type StepTimelineItem = {
  id: string;
  kind: "step";
  toolCallId: string;
  step: number;
  summary?: string;
  message?: string;
};

type SpecExpandedTimelineItem = {
  id: string;
  kind: "spec_expanded";
  original: string;
  expanded: string;
};

type SystemTimelineItem = {
  id: string;
  kind: "system";
  severity: "info" | "warning" | "error";
  content: string;
};

type TypecheckTimelineItem = {
  id: string;
  kind: "typecheck";
  status: "running" | "passed" | "failed" | "errors";
  output?: string;
  errorMessage?: string;
};

type ChatTimelineItem =
  | ConversationTimelineItem
  | ToolTimelineItem
  | PlanTimelineItem
  | StepTimelineItem
  | SpecExpandedTimelineItem
  | SystemTimelineItem
  | TypecheckTimelineItem;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const generateTimelineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MOCK_FLOW_ENABLED =
  DEBUG_MODE;

const isConversationItem = (
  item: ChatTimelineItem,
): item is ConversationTimelineItem =>
  item.kind === "user" || item.kind === "assistant";

const getArgString = (args: unknown, key: string): string | undefined => {
  if (
    args &&
    typeof args === "object" &&
    !Array.isArray(args) &&
    key in (args as Record<string, unknown>)
  ) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const getResultText = (result: unknown): string | undefined => {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;

  if (typeof record.summary === "string" && record.summary.trim()) {
    return record.summary.trim();
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  return undefined;
};

const getToolIcon = (toolName: string): IconComponent => {
  const normalized = toolName.toLowerCase();
  switch (normalized) {
    case "read_file":
      return EyeIcon;
    case "write_file":
    case "append_file_content":
    case "replace_file_content":
      return PencilIcon;
    case "create_file":
      return DocumentPlusIcon;
    case "delete_file":
      return TrashIcon;
    case "list_files":
      return ListBulletIcon;
    case "search_files":
      return MagnifyingGlassIcon;
    case "run_command":
      return CommandLineIcon;
    case "deploy_preview":
      return RocketLaunchIcon;
    case "create_execution_plan":
      return ClipboardDocumentListIcon;
    case "confirm_step_completion":
      return CheckCircleIcon;
    default:
      return CpuChipIcon;
  }
};

const getToolLabel = (
  toolName: string,
  args?: unknown,
  result?: unknown,
): string => {
  const normalized = toolName.toLowerCase();
  const filePath = getArgString(args, "filePath");
  const directory = getArgString(args, "directory");
  const query = getArgString(args, "query");
  const command = getArgString(args, "command");

  switch (normalized) {
    case "read_file":
      return filePath ? `Read ${filePath}` : "Read file";
    case "write_file":
    case "replace_file_content":
    case "append_file_content":
      return filePath ? `Edited ${filePath}` : "Edited file";
    case "create_file":
      return filePath ? `Created ${filePath}` : "Created file";
    case "delete_file":
      return filePath ? `Deleted ${filePath}` : "Deleted file";
    case "list_files":
      return directory ? `Listed ${directory}` : "Listed files";
    case "search_files":
      return query ? `Searching for "${query}"` : "Searched files";
    case "run_command":
      return command ? `Ran ${command}` : "Ran command";
    case "deploy_preview":
      return "Deploying preview";
    case "create_execution_plan":
      return "Creating execution plan";
    case "confirm_step_completion":
      return "Confirming step completion";
    default: {
      const detail = getResultText(result);
      if (detail) return detail;
      return toolName
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
};

const getToolDetail = (result?: unknown): string | undefined => {
  const text = getResultText(result);
  if (text && !/success|completed/i.test(text)) {
    return text;
  }
  return undefined;
};

// Component for rendering an image with signed URL
function ChatImage({ imageUrl }: { imageUrl: string; }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSignedUrl = async () => {
      try {
        const url = await getSignedImageUrl(imageUrl);
        if (mounted) {
          if (url) {
            setSignedUrl(url);
          } else {
            setHasError(true);
          }
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    };

    loadSignedUrl();

    return () => {
      mounted = false;
    };
  }, [imageUrl]);

  if (isLoading) {
    return (
      <div className="mb-2 p-4 border border-primary-foreground/20 rounded flex items-center justify-center">
        <span className="text-xs text-primary-foreground/70">Loading image...</span>
      </div>
    );
  }

  if (hasError || !signedUrl) {
    return (
      <div className="mb-2 p-2 border border-primary-foreground/20 rounded flex items-center gap-2 text-primary-foreground/70">
        <PhotoIcon className="w-4 h-4" />
        <span className="text-xs">Image no longer available</span>
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={signedUrl}
        alt="User uploaded"
        className="max-w-full max-h-48 rounded border border-primary-foreground/20"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

export interface PrototypeChatWindowProps {
  prototypeId: string | undefined;
  prototype?: Prototype | null;
  canEditPrototype?: boolean;
  onPrototypeUpdate?: (updatedPrototype: Prototype) => void;

  // File system integration
  files: Record<string, PrototypeFile>;
  assets: Record<string, PrototypeAsset>;
  onFilesUpdate: (params: {
    updatedFiles: Record<string, PrototypeFile>;
    deletedFiles?: string[];
    applyUpdatesToServer: boolean;
  }) => void;

  // Loading state
  isChatLoading: boolean;
  setIsChatLoading: (loading: boolean) => void;

  // Viewing URL callback
  currentViewingUrl: string;
  onViewingUrlUpdate: (viewingUrl: string) => void;

  // Render status for disabling input
  currentRenderStatus: RenderStatus;
  onCurrentRenderStatusChange: (status: RenderStatus) => void;

  // Current viewing path for LLM context
  currentViewingPath: string;

  // Model provider selection
  modelProvider: "google" | "anthropic" | "openai" | "openai-mini";
  onModelProviderChange: (
    provider: "google" | "anthropic" | "openai" | "openai-mini",
  ) => void;
}

export default function PrototypeChatWindow({
  files,
  assets,
  onFilesUpdate,
  prototypeId,
  prototype,
  canEditPrototype = false,
  onPrototypeUpdate,
  isChatLoading,
  setIsChatLoading,
  currentViewingUrl,
  onViewingUrlUpdate,
  currentRenderStatus,
  onCurrentRenderStatusChange,
  currentViewingPath,
  modelProvider,
  onModelProviderChange,
}: PrototypeChatWindowProps) {
  const logger = useProductLogger();
  const { user } = useUser();
  const userId = user?.id;
  const {
    userPlan,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
  } = useSubscriptionAccess();

  // Chat state
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  const [timelineItems, setTimelineItems] = useState<ChatTimelineItem[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Usage and subscription
  const [messageCount, setMessageCount] = useState<number>(0);
  const [loadingUsageCount, setLoadingCount] = useState<boolean>(true);
  const [showUpsellModal, setShowUpsellModal] = useState<boolean>(false);
  const [buildErrors, setBuildErrors] = useState<CodeError[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  // UI state
  const [showClearChatDialog, setShowClearChatDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Thoughts and execution plan state
  const [currentThought, setCurrentThought] = useState<string>("");
  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(false);
  const [executionPlan, setExecutionPlan] = useState<string[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [explicitlyCompletedSteps, setExplicitlyCompletedSteps] = useState<
    Set<number>
  >(new Set());
  const [expandedSpecItems, setExpandedSpecItems] = useState<Set<string>>(
    new Set(),
  );

  // Image upload state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Use ref to avoid stale closure issues in streaming
  const prototypeChatSessionRef = useRef<PrototypeChatSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const mockFlowTimeoutsRef = useRef<number[]>([]);

  const prototypeTitle = prototype?.name?.trim() || "Prototype";
  const visibility = prototype?.visibility?.toLowerCase();
  const visibilityLabel =
    visibility === "public"
      ? "Public"
      : visibility === "team"
        ? "Team"
        : "Private";
  const createdAtLabel = prototype?.created_at
    ? new Date(prototype.created_at).toLocaleDateString()
    : null;
  const canEditName = Boolean(canEditPrototype && onPrototypeUpdate);

  // Helper function to get model display name
  const getModelDisplayName = (provider: string) => {
    switch (provider) {
      case "anthropic":
        return "Sonnet 4.5";
      case "openai":
        return "GPT-5";
      case "google":
        return "Gemini 2.5 Flash";
      case "openai-mini":
        return "GPT-5 Nano";
      default:
        return "Select model";
    }
  };


  // File autocomplete functionality
  const {
    autocompleteState,
    handleTextareaChange,
    handleFileSelect,
    closeAutocomplete,
    textareaRef,
  } = useFileAutocomplete({
    files,
    currentMessage,
    onMessageChange: setCurrentMessage,
  });

  // Keep ref in sync with state
  useEffect(() => {
    prototypeChatSessionRef.current = prototypeChatSession;
  }, [prototypeChatSession]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (timelineItems.length === 0) return;

    const lastItem = timelineItems[timelineItems.length - 1];

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        const shouldAlignEnd = lastItem.kind === "user";
        messagesEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: shouldAlignEnd ? "end" : "start",
        });
      }
    });
  }, [timelineItems]);

  useEffect(
    () => () => {
      mockFlowTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      mockFlowTimeoutsRef.current = [];
    },
    [],
  );

  // Convert image file to base64 data URI
  const convertImageToBase64 = useCallback(
    (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    [],
  );

  // Handle image selection from file input or drag-and-drop
  const handleImageSelect = useCallback(
    async (file: File) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        logger.debug("error", "Invalid file type - must be an image", {
          fileType: file.type,
        });
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        logger.debug("error", "Image file too large - max 5MB", {
          fileSize: file.size,
        });
        return;
      }

      try {
        const base64 = await convertImageToBase64(file);
        setImagePreview(base64);
      } catch (error) {
        logger.debug("error", "Error converting image to base64:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [convertImageToBase64, logger],
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleImageSelect(file);
      }
      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleImageSelect],
  );

  // Handle drag-and-drop events
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingOver(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleImageSelect(file);
      }
    },
    [handleImageSelect],
  );

  // Remove selected image
  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
  }, []);

  const clearMockFlowTimeouts = useCallback(() => {
    mockFlowTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    mockFlowTimeoutsRef.current = [];
  }, []);

  const runMockChatFlow = useCallback(() => {
    if (!MOCK_FLOW_ENABLED) return;
    if (isChatLoading) return;

    clearMockFlowTimeouts();

    const mockAssistantId = generateTimelineId("assistant");
    const mockToolItemId = generateTimelineId("tool");
    const mockToolCallId = generateTimelineId("toolcall");
    const mockUserId = generateTimelineId("user");
    const mockSpecId = generateTimelineId("spec");

    setTimelineItems([
      {
        id: mockUserId,
        kind: "user",
        role: "user",
        content: "Can you redesign the home page hero section?",
      },
    ]);

    setCurrentMessage("");
    setCurrentThought("");
    setExecutionPlan([]);
    setCompletedSteps(new Set());
    setExplicitlyCompletedSteps(new Set());
    setIsThoughtsExpanded(false);
    setIsChatLoading(false);
    setIsConnected(false);

    const schedule = (delay: number, fn: () => void) => {
      const timeoutId = window.setTimeout(() => {
        fn();
        mockFlowTimeoutsRef.current = mockFlowTimeoutsRef.current.filter(
          (id) => id !== timeoutId,
        );
      }, delay);
      mockFlowTimeoutsRef.current.push(timeoutId);
    };

    schedule(200, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: mockSpecId,
          kind: "spec_expanded",
          original:
            "User wants the home page hero refreshed with clearer messaging and stronger CTAs.",
          expanded:
            "Clarify brand value prop, redesign CTA row with primary/secondary buttons, and introduce a richer visual treatment (image + gradient) while preserving responsive layout.",
        },
      ]);
    });

    schedule(350, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: mockAssistantId,
          kind: "assistant",
          role: "assistant",
          content:
            "Let me review the current layout and pull in the relevant files.",
        },
      ]);
    });

    schedule(800, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: mockToolItemId,
          kind: "tool",
          tool: "read_file",
          toolCallId: mockToolCallId,
          status: "running",
          args: { filePath: "app/(marketing)/page.tsx" },
        },
      ]);
      setCurrentThought("Reading app/(marketing)/page.tsx");
      setIsThoughtsExpanded(true);
    });

    schedule(1400, () => {
      setTimelineItems((prev) =>
        prev.map((item) =>
          item.id === mockToolItemId && item.kind === "tool"
            ? {
              ...item,
              status: "success",
              result: { summary: "Fetched hero section layout" },
            }
            : item,
        ),
      );
      setCurrentThought("");
    });

    const mockPlan = [
      "Introduce a bold headline with supporting copy",
      "Add a primary and secondary call-to-action row",
      "Embed a preview image with gradient background",
    ];

    schedule(1800, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: generateTimelineId("plan"),
          kind: "plan",
          toolCallId: mockToolCallId,
          plan: mockPlan,
        },
      ]);
      setExecutionPlan(mockPlan);
      setIsThoughtsExpanded(true);
    });

    schedule(2200, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: generateTimelineId("step"),
          kind: "step",
          toolCallId: mockToolCallId,
          step: 1,
          summary: "Updated hero headline and CTA structure",
        },
      ]);
      setCompletedSteps(new Set([0]));
      setExplicitlyCompletedSteps(new Set([0]));
    });

    schedule(2700, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: generateTimelineId("step"),
          kind: "step",
          toolCallId: mockToolCallId,
          step: 2,
          summary: "Structured dual CTA row with responsive spacing",
        },
      ]);
      setCompletedSteps(new Set([0, 1]));
      setExplicitlyCompletedSteps(new Set([0, 1]));
    });

    schedule(3200, () => {
      setTimelineItems((prev) => [
        ...prev,
        {
          id: generateTimelineId("step"),
          kind: "step",
          toolCallId: mockToolCallId,
          step: 3,
          summary: "Added preview image container with gradient backdrop",
        },
      ]);
      setCompletedSteps(new Set([0, 1, 2]));
      setExplicitlyCompletedSteps(new Set([0, 1, 2]));
    });

    schedule(3800, () => {
      setTimelineItems((prev) =>
        prev.map((item) =>
          item.id === mockAssistantId && item.kind === "assistant"
            ? {
              ...item,
              content:
                "I refreshed the hero section with new copy, CTA buttons, and an image container. Want me to polish the color palette or continue iterating?",
            }
            : item,
        ),
      );
      setIsThoughtsExpanded(false);
    });
  }, [clearMockFlowTimeouts, isChatLoading]);

  const handleStartTitleEdit = useCallback(() => {
    if (!canEditName || !prototype) return;
    setEditedTitle(prototype.name);
    setIsEditingTitle(true);
  }, [canEditName, prototype]);

  const handleCancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
    setEditedTitle("");
  }, []);

  const handleSaveTitle = useCallback(async () => {
    if (!canEditName || !prototype || !editedTitle.trim() || !onPrototypeUpdate) {
      return;
    }

    try {
      setIsUpdatingTitle(true);
      const trimmedName = editedTitle.trim();
      const { error } = await supabase
        .from("prototypes")
        .update({ name: trimmedName })
        .eq("id", prototype.id);

      if (error) {
        throw error;
      }

      onPrototypeUpdate({ ...prototype, name: trimmedName });
      setIsEditingTitle(false);
      setEditedTitle("");
    } catch (error) {
      logger.debug("error", "Error updating prototype name:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsUpdatingTitle(false);
    }
  }, [canEditName, editedTitle, logger, onPrototypeUpdate, prototype]);


  useEffect(() => {
    async function fetchPrototypeChatSessionAndMessages() {
      if (!prototypeId || !userId) return;

      // fetch or create project chat session
      const { data, error } = await supabase
        .from("prototype_chat_sessions")
        .select("*")
        .eq("prototype_id", prototypeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        logger.debug("error", "Error fetching project chat session:", {
          ...error,
        });
        return;
      }

      let chatSession = data;
      if (!chatSession) {
        // No session found, create one
        const { data: newSession, error: createError } = await supabase
          .from("prototype_chat_sessions")
          .insert({ prototype_id: prototypeId, user_id: userId })
          .select()
          .single();
        if (createError) {
          logger.debug("error", "Error creating project chat session:", {
            ...createError,
          });
          return;
        }
        chatSession = newSession;
        setPrototypeChatSession(newSession);
      } else {
        setPrototypeChatSession(chatSession);
      }

      // Fetch ALL messages and events for this session, ordered by sequence
      const { data: messagesData, error: messagesError } = await supabase
        .from("prototype_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSession.id)
        .order("sequence", { ascending: true })
        .limit(200); // Increased limit to include events
      if (messagesError) {
        logger.debug("error", "Error fetching chat messages:", {
          ...messagesError,
        });
        return;
      }

      // Reconstruct timeline from database rows (chat messages + events)
      const reconstructedTimeline: ChatTimelineItem[] = [];
      // Track tool calls to merge TOOL_CALL and TOOL_RESULT events
      const toolCallMap = new Map<string, { callRow?: typeof messagesData[0], resultRow?: typeof messagesData[0]; }>();

      // First pass: group tool events by toolCallId
      for (const row of messagesData || []) {
        if (row.message_type === "event" && row.event_type) {
          const eventData = row.event_data as Record<string, unknown> | null;

          if (row.event_type === ChatStreamEventType.TOOL_CALL || row.event_type === ChatStreamEventType.TOOL_RESULT) {
            const toolCallId = String(eventData?.toolCallId || generateTimelineId("toolcall"));
            const existing = toolCallMap.get(toolCallId) || {};

            if (row.event_type === ChatStreamEventType.TOOL_CALL) {
              existing.callRow = row;
            } else {
              existing.resultRow = row;
            }

            toolCallMap.set(toolCallId, existing);
          }
        }
      }

      // Second pass: build timeline items
      for (const row of messagesData || []) {
        // Handle chat messages (message_type = 'chat')
        if (row.message_type === "chat") {
          reconstructedTimeline.push({
            id: (row.id as string) || generateTimelineId("history"),
            kind: (row.role as "user" | "assistant") ?? "assistant",
            role: row.role as "user" | "assistant",
            content: row.content,
            imageUrl: row.image_url || undefined,
          });
        }
        // Handle events (message_type = 'event')
        else if (row.message_type === "event" && row.event_type) {
          const eventData = row.event_data as Record<string, unknown> | null;

          // Reconstruct timeline items based on event type
          switch (row.event_type) {
            case ChatStreamEventType.EXECUTION_PLAN_CREATED:
              if (eventData?.result && typeof eventData.result === "object") {
                const result = eventData.result as Record<string, unknown>;
                if (Array.isArray(result.plan)) {
                  reconstructedTimeline.push({
                    id: (row.id as string) || generateTimelineId("plan"),
                    kind: "plan",
                    toolCallId: String(eventData.toolCallId || generateTimelineId("plan")),
                    plan: result.plan as string[],
                  });
                }
              }
              break;

            case ChatStreamEventType.STEP_COMPLETED:
              if (eventData?.result && typeof eventData.result === "object") {
                const result = eventData.result as Record<string, unknown>;
                if (typeof result.step === "number") {
                  reconstructedTimeline.push({
                    id: (row.id as string) || generateTimelineId("step"),
                    kind: "step",
                    toolCallId: String(eventData.toolCallId || generateTimelineId("step")),
                    step: result.step as number,
                    summary: typeof result.summary === "string" ? result.summary : undefined,
                    message: typeof result.message === "string" ? result.message : undefined,
                  });
                }
              }
              break;

            case ChatStreamEventType.SPEC_EXPANDED:
              if (eventData?.original_message || eventData?.expanded_message) {
                reconstructedTimeline.push({
                  id: (row.id as string) || generateTimelineId("spec"),
                  kind: "spec_expanded",
                  original: String(eventData.original_message || ""),
                  expanded: String(eventData.expanded_message || ""),
                });
              }
              break;

            case ChatStreamEventType.TOOL_RESULT: {
              // Only create tool items for TOOL_RESULT events (which may or may not have a matching TOOL_CALL)
              if (eventData?.tool || eventData?.toolName) {
                const toolName = String(eventData.tool || eventData.toolName || "Unknown tool");
                // Skip orchestration tools
                if (
                  toolName.toLowerCase() !== "create_execution_plan" &&
                  toolName.toLowerCase() !== "confirm_step_completion"
                ) {
                  const toolCallId = String(eventData.toolCallId || generateTimelineId("toolcall"));
                  const toolGroup = toolCallMap.get(toolCallId);
                  const callEventData = toolGroup?.callRow?.event_data as Record<string, unknown> | null;

                  const success =
                    typeof eventData.result === "object" &&
                      eventData.result !== null &&
                      typeof (eventData.result as Record<string, unknown>).success === "boolean"
                      ? Boolean((eventData.result as Record<string, unknown>).success)
                      : true;

                  reconstructedTimeline.push({
                    id: (row.id as string) || generateTimelineId("tool"),
                    kind: "tool",
                    tool: toolName,
                    toolCallId,
                    status: success ? "success" : "error",
                    args: callEventData?.args || eventData.args,
                    result: eventData.result,
                  });
                }
              }
              break;
            }

            case ChatStreamEventType.TOOL_CALL:
              // Skip TOOL_CALL events - they're merged into TOOL_RESULT above
              break;

            case ChatStreamEventType.ERROR:
            case ChatStreamEventType.DISPATCH_ERROR:
              if (eventData?.error) {
                reconstructedTimeline.push({
                  id: (row.id as string) || generateTimelineId("system"),
                  kind: "system",
                  severity: "error",
                  content: String(eventData.error),
                });
              }
              break;

            // Skip other event types that don't need timeline representation
            default:
              break;
          }
        }
      }

      setTimelineItems(reconstructedTimeline);
    }

    if (prototypeId && userId) {
      fetchPrototypeChatSessionAndMessages();
    }
  }, [prototypeId, userId, logger]);

  // Fetch message count for current billing period
  useEffect(() => {
    async function fetchMessageCount() {
      if (!userId || loadingSubscriptionData) return;

      setLoadingCount(true);
      try {
        const { count, error } = await supabase
          .from("api_usage")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", currentPeriodStart.toISOString())
          .lte("created_at", currentPeriodEnd.toISOString());

        if (error) {
          logger.debug("error", "Error fetching message count:", {
            ...error,
          });
          setMessageCount(0);
        } else {
          setMessageCount(count || 0);
        }
      } catch (error) {
        logger.debug("error", "Error fetching message count:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        setMessageCount(0);
      } finally {
        setLoadingCount(false);
      }
    }

    fetchMessageCount();
  }, [
    userId,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
    logger,
  ]);

  // Handle streaming chat response - processes events from ChatEngine
  // Current events: chat_response_delta, chat_response, tool_call, tool_result,
  // execution_plan_created, step_completed, chat_complete, error, usage_update, viewing_url
  const processStreamingResponse = useCallback(
    async (response: Response) => {
      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // accumulates text across chunks
      let chatResponseBuffer = ""; // Buffer for streaming deltas

      const processBuffer = async () => {
        let sepIndex;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const lines = rawEvent.split("\n");
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("data:"))
              dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;

          const dataText = dataLines.join("\n");
          if (dataText === "[DONE]") continue;

          let event: {
            type: string;
            content?: string;
            tool?: string;
            toolName?: string;
            toolCallId?: string;
            args?: unknown;
            result?: {
              plan?: string[];
              step?: number;
              summary?: string;
              message?: string;
              success?: boolean;
              updatedFiles?: Record<string, PrototypeFile>;
            };
            updatedFiles?: string[] | Record<string, PrototypeFile>;
            updatedFilesObject?: Record<string, PrototypeFile>;
            deletedFiles?: string[];
            error?: string;
            messageCount?: number;
            viewing_url?: string;
            build_errors?: CodeError[];
            intent?: string;
            phase?: string;
            description?: string;
            status?: string;
            imageUrl?: string;
            original_message?: string;
            expanded_message?: string;
            output?: string;
          };
          try {
            event = JSON.parse(dataText);
          } catch {
            // put it back and wait for more bytes (likely partial)
            buffer = rawEvent + "\n\n" + buffer;
            break;
          }

          logger.debug("log", "received event: ", { event });
          // Handle different event types
          switch (event.type) {
            case ChatStreamEventType.DISPATCH_START: {
              // Clear chat intent when build dispatch starts to prevent autoStartDevServer race condition
              // DO NOT MOVE THIS LINE TO AN EARLIER STEP. YOU **WILL** CAUSE A SEV.
              logger.debug("log", "received dispatch_start event");
              onCurrentRenderStatusChange("Updating..");
              clearChatIntent();
              break;
            }
            case ChatStreamEventType.CHAT_RESPONSE_DELTA:
              // Handle streaming text deltas
              const delta = String(event.content || "");
              chatResponseBuffer += delta;

              // Render progressively: append to last assistant message or create new one
              setTimelineItems((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.kind === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: `${last.content}${delta}`,
                  };
                  return copy;
                }
                return [
                  ...prev,
                  {
                    id: generateTimelineId("assistant"),
                    kind: "assistant",
                    role: "assistant",
                    content: delta,
                  },
                ];
              });
              break;

            case ChatStreamEventType.CHAT_RESPONSE:
              // Handle final response (use chatResponseBuffer if content is empty)
              const finalContent = String(event.content || chatResponseBuffer);
              if (finalContent) {
                setTimelineItems((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.kind === "assistant") {
                    copy[copy.length - 1] = {
                      ...last,
                      content: finalContent,
                    };
                    return copy;
                  }
                  return [
                    ...prev,
                    {
                      id: generateTimelineId("assistant"),
                      kind: "assistant",
                      role: "assistant",
                      content: finalContent,
                    },
                  ];
                });
              }
              chatResponseBuffer = ""; // Reset buffer
              break;

            case ChatStreamEventType.TOOL_CALL:
              // Surface tool calls in the timeline as they happen
              const toolName = String(
                event.tool || event.toolName || "Unknown tool",
              );
              // Skip showing tool items for create_execution_plan and confirm_step_completion
              if (
                toolName.toLowerCase() === "create_execution_plan" ||
                toolName.toLowerCase() === "confirm_step_completion"
              ) {
                // Still set the thought for create_execution_plan to show progress
                if (toolName.toLowerCase() === "create_execution_plan") {
                  setCurrentThought(getToolLabel(toolName, event.args));
                  setIsThoughtsExpanded(true);
                }
                break;
              }
              const toolItem: ToolTimelineItem = {
                id: generateTimelineId("tool"),
                kind: "tool",
                tool: toolName,
                toolCallId: String(
                  event.toolCallId || generateTimelineId("toolcall"),
                ),
                status: "running",
                args: event.args,
              };
              setTimelineItems((prev) => [...prev, toolItem]);
              setCurrentThought(getToolLabel(toolName, event.args));
              setIsThoughtsExpanded(true);
              break;

            case ChatStreamEventType.TOOL_RESULT:
              // Update files if the tool result contains updated files
              // TODO (Priyam): This breaks because of streaming. Skip for now.
              // if (event.result?.updatedFiles) {
              //   onFilesUpdate({
              //     updatedFiles: event.result.updatedFiles,
              //     applyUpdatesToServer: true,
              //   });
              // }
              // Clear current thought when tool completes
              const completedToolName = String(
                event.tool || event.toolName || "Unknown tool",
              );
              // Skip updating tool items for create_execution_plan and confirm_step_completion
              if (
                completedToolName.toLowerCase() === "create_execution_plan" ||
                completedToolName.toLowerCase() === "confirm_step_completion"
              ) {
                break;
              }
              setTimelineItems((prev) => {
                const copy = [...prev];
                const callId = String(
                  event.toolCallId || generateTimelineId("toolcall"),
                );
                const index = copy.findIndex(
                  (item) => item.kind === "tool" && item.toolCallId === callId,
                );
                const success =
                  typeof (event.result as Record<string, unknown> | undefined)
                    ?.success === "boolean"
                    ? Boolean(
                      (event.result as Record<string, unknown>).success,
                    )
                    : true;

                if (index !== -1) {
                  const existing = copy[index] as ToolTimelineItem;
                  copy[index] = {
                    ...existing,
                    status: success ? "success" : "error",
                    result: event.result,
                  };
                  return copy;
                }

                return [
                  ...copy,
                  {
                    id: generateTimelineId("tool"),
                    kind: "tool",
                    tool: completedToolName,
                    toolCallId: callId,
                    status: success ? "success" : "error",
                    args: event.args,
                    result: event.result,
                  },
                ];
              });
              setCurrentThought("");
              break;

            case ChatStreamEventType.EXECUTION_PLAN_CREATED:
              // Set execution plan state instead of showing in chat
              const plan = event.result?.plan;
              if (plan && Array.isArray(plan)) {
                setTimelineItems((prev) => [
                  ...prev,
                  {
                    id: generateTimelineId("plan"),
                    kind: "plan",
                    toolCallId: String(
                      event.toolCallId || generateTimelineId("plan"),
                    ),
                    plan,
                  },
                ]);
                setExecutionPlan(plan);
                setCompletedSteps(new Set());
                setExplicitlyCompletedSteps(new Set());
                // Don't auto-expand - let it stay collapsed if user wants
                // setIsThoughtsExpanded(true);
                // Clear the "Creating execution plan" thought since plan is now shown
                setCurrentThought("");
              }
              break;

            case ChatStreamEventType.STEP_COMPLETED:
              // Mark step as completed instead of showing in chat
              const stepNum = event.result?.step;
              if (typeof stepNum === "number") {
                setTimelineItems((prev) => [
                  ...prev,
                  {
                    id: generateTimelineId("step"),
                    kind: "step",
                    toolCallId: String(
                      event.toolCallId || generateTimelineId("step"),
                    ),
                    step: stepNum,
                    summary:
                      typeof event.result?.summary === "string"
                        ? event.result.summary
                        : undefined,
                    message:
                      typeof event.result?.message === "string"
                        ? event.result.message
                        : undefined,
                  },
                ]);
                setCompletedSteps((prev) => {
                  const newCompleted = new Set(prev);
                  // Mark this step and all previous steps as completed
                  for (let i = 0; i < stepNum; i++) {
                    newCompleted.add(i); // 0-based indexing
                  }
                  return newCompleted;
                });
                // Track which step was explicitly completed
                setExplicitlyCompletedSteps((prev) => {
                  const newExplicit = new Set(prev);
                  newExplicit.add(stepNum - 1); // Convert to 0-based index
                  return newExplicit;
                });
              }
              break;

            case ChatStreamEventType.CHAT_COMPLETE:
              // Chat is finished - clear thoughts and close execution plan
              chatResponseBuffer = ""; // Reset buffer
              setCurrentThought("");
              setIsThoughtsExpanded(false);
              setIsChatLoading(false);

              // Mark all remaining steps as completed
              setTimelineItems((prevTimeline) => {
                // Find the most recent plan in timeline
                const planItem = [...prevTimeline].reverse().find((item) => item.kind === "plan") as PlanTimelineItem | undefined;
                if (planItem) {
                  setCompletedSteps((prev) => {
                    const allCompleted = new Set(prev);
                    for (let i = 0; i < planItem.plan.length; i++) {
                      allCompleted.add(i);
                    }
                    return allCompleted;
                  });
                }
                return prevTimeline;
              });
              break;

            case ChatStreamEventType.USAGE_UPDATE:
              // Update the local message count with the value returned from the API
              if (typeof event.messageCount === "number") {
                if (event.messageCount !== messageCount) {
                  setMessageCount(event.messageCount);
                }
              }
              break;
            case ChatStreamEventType.STREAM_COMPLETE:
              // Stream is finished
              chatResponseBuffer = "";
              setIsChatLoading(false);
              setIsThoughtsExpanded(false);
              setExecutionPlan([]);
              setCompletedSteps(new Set());
              setExplicitlyCompletedSteps(new Set());
              setCurrentThought("");
              break;
            case ChatStreamEventType.VIEWING_URL:
              // Handle viewing URL update
              logger.debug(
                "log",
                "received viewing_url event, setting status to Connected",
              );
              if (!event.viewing_url) break;
              if (event.viewing_url !== currentViewingUrl) {
                onViewingUrlUpdate(event.viewing_url);
                onCurrentRenderStatusChange("Connecting..");
              } else {
                onCurrentRenderStatusChange("Connected");
              }
              break;
            case ChatStreamEventType.FILES_SYNCED:
              // Handle final file sync after dispatch
              logger.debug("log", "received files_synced event");
              const updatedFilesObject =
                (event.updatedFilesObject as Record<string, PrototypeFile>) ||
                {};
              const deletedFileNames = (event.deletedFiles as string[]) || [];
              logger.debug("log", "updated file names: ", {
                updatedFileNames: Object.keys(updatedFilesObject),
              });
              logger.debug("log", "deleted file names: ", {
                deletedFileNames: Object.keys(deletedFileNames),
              });

              onFilesUpdate({
                updatedFiles: updatedFilesObject,
                deletedFiles: deletedFileNames,
                applyUpdatesToServer: true,
              });
              setIsChatLoading(false);
              break;
            case ChatStreamEventType.BUILD_ERRORS:
              setBuildErrors(event.build_errors || []);
              break;
            case ChatStreamEventType.DISPATCH_ERROR:
              setTimelineItems((prev) => [
                ...prev,
                {
                  id: generateTimelineId("system"),
                  kind: "system",
                  severity: "error",
                  content:
                    "⚠️ Preview Update Failed: There was a problem updating the live preview.",
                },
              ]);
              logger.debug("error", "Dispatch error from server:", {
                event,
              });
              setIsChatLoading(false);
              break;

            case ChatStreamEventType.ERROR:
              setTimelineItems((prev) => [
                ...prev,
                {
                  id: generateTimelineId("system"),
                  kind: "system",
                  severity: "error",
                  content: `❌ Error: ${String(event.error || "Unknown error")}`,
                },
              ]);
              break;

            // New intermediate thought events - received but no UI yet
            case ChatStreamEventType.INTENT_DETECTED:
              // TODO: Consider showing intent badge or status
              logger.debug("log", "Intent detected:", {
                intent: event.intent,
              });
              break;

            case ChatStreamEventType.PHASE_STARTED:
              // TODO: Consider showing phase progress indicator
              logger.debug("log", "Phase started:", {
                phase: event.phase,
                description: event.description,
              });
              break;

            case ChatStreamEventType.IMAGE_PROCESSING:
              // TODO: Consider showing image processing status
              logger.debug("log", "Image processing:", {
                status: event.status,
                imageUrl: event.imageUrl,
              });
              break;

            case ChatStreamEventType.SPEC_EXPANDED:
              logger.debug("log", "Spec expanded:", {
                original_length: event.original_message?.length,
                expanded_length: event.expanded_message?.length,
              });
              if (event.original_message || event.expanded_message) {
                setTimelineItems((prev) => [
                  ...prev,
                  {
                    id: generateTimelineId("spec"),
                    kind: "spec_expanded",
                    original: event.original_message || "",
                    expanded: event.expanded_message || "",
                  },
                ]);
              }
              break;

            case ChatStreamEventType.TYPECHECK_STARTED:
              logger.debug("log", "Typecheck started");
              setTimelineItems((prev) => [
                ...prev,
                {
                  id: generateTimelineId("typecheck"),
                  kind: "typecheck",
                  status: "running",
                },
              ]);
              break;

            case ChatStreamEventType.TYPECHECK_PASSED:
              logger.debug("log", "Typecheck passed");
              setTimelineItems((prev) => {
                const copy = [...prev];
                const typecheckIndex = copy.findIndex(
                  (item) => item.kind === "typecheck" && item.status === "running",
                );
                if (typecheckIndex !== -1) {
                  copy[typecheckIndex] = {
                    ...(copy[typecheckIndex] as TypecheckTimelineItem),
                    status: "passed",
                  };
                } else {
                  copy.push({
                    id: generateTimelineId("typecheck"),
                    kind: "typecheck",
                    status: "passed",
                  });
                }
                return copy;
              });
              break;

            case ChatStreamEventType.TYPECHECK_ERRORS:
              logger.debug("log", "Typecheck errors detected");
              setTimelineItems((prev) => {
                const copy = [...prev];
                const typecheckIndex = copy.findIndex(
                  (item) => item.kind === "typecheck" && item.status === "running",
                );
                if (typecheckIndex !== -1) {
                  copy[typecheckIndex] = {
                    ...(copy[typecheckIndex] as TypecheckTimelineItem),
                    status: "errors",
                    output: typeof event.output === "string" ? event.output : undefined,
                  };
                } else {
                  copy.push({
                    id: generateTimelineId("typecheck"),
                    kind: "typecheck",
                    status: "errors",
                    output: typeof event.output === "string" ? event.output : undefined,
                  });
                }
                return copy;
              });
              break;

            case ChatStreamEventType.TYPECHECK_FAILED:
              logger.debug("log", "Typecheck failed");
              setTimelineItems((prev) => {
                const copy = [...prev];
                const typecheckIndex = copy.findIndex(
                  (item) => item.kind === "typecheck" && item.status === "running",
                );
                if (typecheckIndex !== -1) {
                  copy[typecheckIndex] = {
                    ...(copy[typecheckIndex] as TypecheckTimelineItem),
                    status: "failed",
                    errorMessage: typeof event.error === "string" ? event.error : undefined,
                  };
                } else {
                  copy.push({
                    id: generateTimelineId("typecheck"),
                    kind: "typecheck",
                    status: "failed",
                    errorMessage: typeof event.error === "string" ? event.error : undefined,
                  });
                }
                return copy;
              });
              break;
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append decoded text; { stream:true } preserves partial UTF-8 sequences
          const text = decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, "\n");
          buffer += text;
          await processBuffer();
        }
        // Final flush: drain any remaining decoder bytes and process once more
        buffer += decoder.decode(); // no args -> flush
        buffer = buffer.replace(/\r\n/g, "\n");
        await processBuffer();
      } catch (streamError) {
        logger.debug("error", "Stream processing error:", {
          error:
            streamError instanceof Error
              ? streamError.message
              : String(streamError),
        });
      } finally {
        setIsConnected(false);
        reader.releaseLock();
      }
    },
    [
      onFilesUpdate,
      onViewingUrlUpdate,
      currentViewingUrl,
      logger,
      setIsChatLoading,
      onCurrentRenderStatusChange,
    ],
  );

  // Calculate limits based on subscription plan
  const getMessageLimit = () => {
    switch (userPlan) {
      case "free":
        return 15;
      case "pro":
        return 100;
      case "team":
        return 100; // Assuming team has same limit as pro
      default:
        return 15;
    }
  };

  const messageLimit = getMessageLimit();
  const isAtLimit = userPlan === "free" && messageCount >= messageLimit;
  const isDevServerNotReady = currentRenderStatus === "Starting Dev Server..";
  const inputDisabledReasons = {
    noPrototypeChatSession: !prototypeChatSession,
    noFiles: !files,
    isChatLoading,
    isAtLimit,
    isDevServerNotReady,
  } as const;
  const isInputDisabled = Object.values(inputDisabledReasons).some(Boolean);
  const isSendDisabled = !currentMessage.trim() || isInputDisabled;

  // Show upsell modal when free user reaches limit
  useEffect(() => {
    if (userPlan === "free" && messageCount >= 15 && !loadingUsageCount) {
      setShowUpsellModal(true);
    }
  }, [userPlan, messageCount, loadingUsageCount]);

  // Handle sending messages
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (
        !message.trim() ||
        !prototypeChatSession ||
        !files ||
        isChatLoading ||
        isDevServerNotReady
      )
        return;

      // Check if user is at limit before sending
      if (isAtLimit) {
        setShowUpsellModal(true);
        return;
      }

      // Handle image attachment if present
      let imageUrl: string | undefined;
      let messageContent = message.trim();

      if (imagePreview && prototypeId) {
        // Upload image to Supabase Storage
        setIsChatLoading(true); // Show loading while uploading
        const uploadResult = await uploadChatImage(
          imagePreview,
          prototypeId,
        );

        if (uploadResult.success && uploadResult.url) {
          imageUrl = uploadResult.url;
          // Add placeholder text to message content
          messageContent = `📎 [Image attached]\n\n${messageContent}`;
          // Clear image preview after successful upload
          setImagePreview(null);
        } else {
          // If upload failed, show error and stop
          logger.debug("error", "Failed to upload image to Supabase Storage", {
            error: uploadResult.error,
          });
          setTimelineItems((prev) => [
            ...prev,
            {
              id: generateTimelineId("system"),
              kind: "system",
              severity: "error",
              content: `❌ Error: Failed to upload image. ${uploadResult.error || "Please try again."
                }`,
            },
          ]);
          setIsChatLoading(false);
          return;
        }
      }

      // Convert messages to the expected ServerChatMessage format
      const userMessage: ChatMessage = {
        role: "user",
        content: messageContent,
        imageUrl,
      };

      const userTimelineItem: ConversationTimelineItem = {
        ...userMessage,
        id: generateTimelineId("user"),
        kind: "user",
      };

      const updatedTimeline = [...timelineItems, userTimelineItem];

      const serverMessages: ServerChatMessage[] = updatedTimeline
        .filter(isConversationItem)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
      const requestBody: ChatRequestBody = {
        messages: serverMessages,
        inputFiles: files,
        inputAssets: assets,
        chat_session_id: prototypeChatSession.id,
        prototype_id: prototypeId || "",
        imageUrl: imageUrl, // Send the storage URL (will be converted to base64 by server)
        currentViewingPath: currentViewingPath,
        modelProvider: modelProvider,
      };
      setTimelineItems(updatedTimeline);
      setCurrentMessage("");
      setIsChatLoading(true);
      setIsConnected(true);

      // Reset thoughts and execution plan state for new conversation
      setCurrentThought("");
      setExecutionPlan([]);
      setCompletedSteps(new Set());
      setExplicitlyCompletedSteps(new Set());
      setIsThoughtsExpanded(false);

      try {
        // Get access token for authentication
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) {
          throw new Error("No access token available");
        }

        // Make streaming request
        const streamingResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              Authorization: `Bearer ${session.session.access_token}`,
            },
            body: JSON.stringify(requestBody),
          },
        );

        if (!streamingResponse.ok) {
          // Try to parse error response
          try {
            const errorData: ChatErrorResponse = await streamingResponse.json();
            if (errorData.error) {
              // Handle specific error cases
              if (
                errorData.usage &&
                errorData.usage.current >= errorData.usage.limit
              ) {
                setShowUpsellModal(true);
                return;
              }
              throw new Error(errorData.error);
            }
          } catch {
            throw new Error(`HTTP error! status: ${streamingResponse.status}`);
          }
        }

        // Process the streaming response
        await processStreamingResponse(streamingResponse);
      } catch (error) {
        logger.debug("error", "Error sending message:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        setTimelineItems((prev) => [
          ...prev,
          {
            id: generateTimelineId("system"),
            kind: "system",
            severity: "error",
            content: "Sorry, I encountered an error.",
          },
        ]);
      } finally {
        setIsChatLoading(false);
        setIsConnected(false);
      }
    },
    [
      timelineItems,
      prototypeChatSession,
      files,
      assets,
      prototypeId,
      isChatLoading,
      isAtLimit,
      isDevServerNotReady,
      processStreamingResponse,
      logger,
      setIsChatLoading,
      imagePreview,
      currentViewingPath,
      modelProvider,
    ],
  );

  // Handle clear chat
  const handleClearChat = useCallback(async () => {
    if (prototypeChatSession?.id && prototypeId) {
      try {
        // Delete all messages for this chat session
        const { error } = await supabase
          .from("prototype_chat_messages")
          .delete()
          .eq("chat_session_id", prototypeChatSession.id);

        if (error) {
          logger.debug("error", "Error clearing chat messages:", {
            ...error,
          });
          return;
        }

        // Delete all images for this prototype from storage
        await deletePrototypeImages(prototypeId);

        // Clear the local state
        setTimelineItems([]);
        setShowClearChatDialog(false);

        // Clear execution plan and thoughts state
        setCurrentThought("");
        setExecutionPlan([]);
        setCompletedSteps(new Set());
        setExplicitlyCompletedSteps(new Set());
        setIsThoughtsExpanded(false);
      } catch (error) {
        logger.debug("error", "Error clearing chat:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }, [prototypeChatSession, prototypeId, logger]);

  // Handle inserting build errors into text box
  const handleInsertBuildErrors = () => {
    if (buildErrors.length === 0) return;

    const errorText = buildErrors
      .map(
        (error) =>
          `${error.file}:${error.line}:${error.column} - ${error.message}`,
      )
      .join("\n");

    const message = `Please help me fix these build errors:\n\n${errorText}`;
    setCurrentMessage(message);

    // Focus the textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const renderTimelineItem = (item: ChatTimelineItem) => {
    switch (item.kind) {
      case "user":
        return (
          <div key={item.id} className="flex justify-end">
            <div className="max-w-[90%] rounded-lg bg-primary p-3 text-primary-foreground shadow-sm">
              {item.imageUrl && <ChatImage imageUrl={item.imageUrl} />}
              <div className="whitespace-pre-wrap break-words leading-relaxed">
                {item.content}
              </div>
            </div>
          </div>
        );

      case "assistant":
        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[90%] text-sm leading-relaxed text-foreground">
              <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-3 [&>p:last-child]:mb-0 [&>ul]:mb-3 [&>ol]:mb-3 [&>pre]:mb-3 [&>blockquote]:mb-3">
                <ReactMarkdown>{item.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        );

      case "tool": {
        // Don't render create_execution_plan or confirm_step_completion tools
        const normalizedTool = item.tool.toLowerCase();
        if (
          normalizedTool === "create_execution_plan" ||
          normalizedTool === "confirm_step_completion"
        ) {
          return null;
        }
        const Icon = getToolIcon(item.tool);
        const label = getToolLabel(item.tool, item.args, item.result);
        const detail = getToolDetail(item.result);
        const isRunning = item.status === "running";
        const isError = item.status === "error";
        const statusNode = isRunning ? (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : isError ? (
          <XCircleIcon className="h-4 w-4 text-red-500 dark:text-red-400" />
        ) : (
          <CheckCircleIcon className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
        );

        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[90%] rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Icon
                  className={`mt-1 h-4 w-4 ${isError
                    ? "text-red-500 dark:text-red-400"
                    : "text-muted-foreground"
                    }`}
                />
                <div className="flex-1">
                  <div
                    className={`font-medium ${isError
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                      }`}
                  >
                    {label}
                  </div>
                  {detail && (
                    <div className="mt-1 text-xs text-muted-foreground/80">
                      {detail}
                    </div>
                  )}
                </div>
                <div className="mt-1 flex-shrink-0">{statusNode}</div>
              </div>
            </div>
          </div>
        );
      }

      case "plan": {
        const planId = item.id;
        const isPlanExpanded = expandedSpecItems.has(planId);
        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[90%] rounded-md border border-border/50 bg-muted/40 text-sm">
              <button
                onClick={() => {
                  setExpandedSpecItems((prev) => {
                    const next = new Set(prev);
                    if (isPlanExpanded) {
                      next.delete(planId);
                    } else {
                      next.add(planId);
                    }
                    return next;
                  });
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isPlanExpanded ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                  <ClipboardDocumentListIcon className="h-4 w-4" />
                  Execution Plan
                </div>
              </button>
              {isPlanExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {item.plan.map((step, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div
                        className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center mt-0.5 ${completedSteps.has(index)
                          ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
                          : "border-muted-foreground/40"
                          }`}
                      >
                        {completedSteps.has(index) && (
                          <CheckIcon className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span
                        className={`flex-1 ${completedSteps.has(index)
                          ? "text-muted-foreground/70 line-through"
                          : "text-muted-foreground"
                          }`}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "step":
        const stepText = item.summary || item.message || "";
        if (!stepText) return null;
        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[90%] text-sm leading-relaxed text-foreground">
              <div className="text-muted-foreground">
                {stepText}
              </div>
            </div>
          </div>
        );

      case "spec_expanded": {
        const isExpanded = expandedSpecItems.has(item.id);
        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[90%] rounded-lg border border-border/40 bg-muted/30 text-sm">
              <button
                onClick={() => {
                  setExpandedSpecItems((prev) => {
                    const next = new Set(prev);
                    if (isExpanded) {
                      next.delete(item.id);
                    } else {
                      next.add(item.id);
                    }
                    return next;
                  });
                }}
                className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isExpanded ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                  Thoughts
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 text-muted-foreground">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {item.expanded}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "system": {
        const isError = item.severity === "error";
        const containerClasses = isError
          ? "border border-destructive/40 bg-destructive/10 text-destructive"
          : "border border-border/50 bg-muted/40 text-muted-foreground";
        const Icon = isError ? XCircleIcon : InformationCircleIcon;

        return (
          <div key={item.id} className="flex justify-start">
            <div
              className={`max-w-[90%] rounded-md px-3 py-2 text-sm leading-relaxed ${containerClasses}`}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4" />
                <span>{item.content}</span>
              </div>
            </div>
          </div>
        );
      }

      case "typecheck": {
        const isRunning = item.status === "running";
        const isPassed = item.status === "passed";
        const hasErrors = item.status === "errors";
        const isFailed = item.status === "failed";
        const [isExpanded, setIsExpanded] = useState(false);

        let containerClasses = "";
        let icon: IconComponent;
        let statusText = "";
        let statusIcon: React.ReactNode = null;

        if (isRunning) {
          containerClasses = "border border-border/50 bg-muted/40";
          icon = WrenchScrewdriverIcon;
          statusText = "Running type check...";
          statusIcon = (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          );
        } else if (isPassed) {
          containerClasses = "border border-emerald-500/40 bg-emerald-500/10";
          icon = CheckCircleIcon;
          statusText = "Type check passed";
          statusIcon = (
            <CheckCircleIcon className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          );
        } else if (hasErrors) {
          containerClasses = "border border-amber-500/40 bg-amber-500/10";
          icon = ExclamationTriangleIcon;
          statusText = "Type errors detected — fixing automatically";
          statusIcon = (
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          );
        } else if (isFailed) {
          containerClasses = "border border-destructive/40 bg-destructive/10";
          icon = XCircleIcon;
          statusText = "Type check failed";
          statusIcon = (
            <XCircleIcon className="h-4 w-4 text-destructive" />
          );
        }

        const Icon = icon!;

        return (
          <div key={item.id} className="flex justify-start">
            <div className={`max-w-[90%] rounded-md ${containerClasses} text-sm`}>
              <div
                className={`flex items-start gap-3 px-3 py-2 ${
                  hasErrors && item.output ? "cursor-pointer hover:bg-muted/20" : ""
                }`}
                onClick={() => {
                  if (hasErrors && item.output) {
                    setIsExpanded(!isExpanded);
                  }
                }}
              >
                <Icon className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {statusText}
                  </div>
                  {isFailed && item.errorMessage && (
                    <div className="mt-1 text-xs text-muted-foreground/80">
                      {item.errorMessage}
                    </div>
                  )}
                </div>
                <div className="mt-1 flex-shrink-0 flex items-center gap-2">
                  {statusIcon}
                  {hasErrors && item.output && (
                    <ChevronDownIcon
                      className={`h-4 w-4 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </div>
              </div>
              {hasErrors && item.output && isExpanded && (
                <div className="border-t border-border/50 px-3 py-2">
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                    {item.output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Handle disconnection
  // Handle chat intent from localStorage
  useEffect(() => {
    if (
      !prototypeId ||
      !prototypeChatSession?.id ||
      Object.keys(files).length === 0 ||
      Object.keys(assets).length === 0 ||
      isChatLoading ||
      !logger
    )
      return;

    // Send chat intent if present in localStorage
    const intent = getChatIntent(prototypeId);
    if (!intent || intent.is_sending) return;
    // Mark as sending to prevent re-processing
    setCurrentMessage(intent.message);
    setTimeout(() => {
      setChatIntent(prototypeId, intent.message, true);
      handleSendMessage(intent.message);
    }, 5);
  }, [
    prototypeId,
    prototypeChatSession,
    isChatLoading,
    files,
    assets,
    logger,
    handleSendMessage,
  ]);

  return (
    <>
      <div
        className="flex flex-col h-full overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="px-3 pb-2 border-b flex-shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center flex-wrap min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate max-w-xs md:max-w-sm">
                {prototypeTitle}
              </h2>
            </div>
            <div className="flex items-center justify-end">
              <TooltipProvider>
                <div className="flex items-center gap-2">
                  {timelineItems.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setShowClearChatDialog(true)}
                          variant="outline"
                          size="icon"
                          aria-label="Clear chat history"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear chat</TooltipContent>
                    </Tooltip>
                  )}
                  {MOCK_FLOW_ENABLED && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={runMockChatFlow}
                          variant="outline"
                          size="icon"
                          aria-label="Run mock chat flow"
                        >
                          <CpuChipIcon className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Run mock flow</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowSettingsModal(true)}
                        variant="outline"
                        size="icon"
                        aria-label="Prototype settings"
                      >
                        <InformationCircleIcon className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Prototype info</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {timelineItems.map((item) => renderTimelineItem(item))}
            {isChatLoading && isConnected && !currentThought && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="relative flex items-center justify-center">
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-pulse"
                      style={{
                        filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.8)) drop-shadow(0 0 8px hsl(var(--primary) / 0.5))",
                      }}
                    ></div>
                    <div
                      className="absolute inset-0 w-2 h-2 bg-primary rounded-full animate-ping opacity-50"
                      style={{
                        filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.9))",
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium shimmer-text">
                    Thinking...
                  </span>
                </div>
              </div>
            )}
            {/* Invisible element at the end for scrolling */}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Drag overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary z-50 flex items-center justify-center">
            <div className="bg-background rounded-lg p-6 shadow-lg">
              <PhotoIcon className="w-12 h-12 mx-auto mb-2 text-primary" />
              <p className="text-lg font-medium">Drop image here</p>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="px-3 py-2 border-t flex-shrink-0">
          <div className="space-y-2">
            {/* Image Preview */}
            {imagePreview && (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-w-xs max-h-32 rounded-lg border"
                />
                <Button
                  onClick={handleRemoveImage}
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6 p-0"
                >
                  <XMarkIcon className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="relative overflow-visible">
              {/* Combined Input Container */}
              <div className="relative border rounded-lg bg-background">
                <Textarea
                  ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                  value={currentMessage}
                  onChange={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    handleTextareaChange(e.target.value, target.selectionStart);
                  }}
                  placeholder="Describe the mobile app you want to build..."
                  className="min-h-[180px] resize-y text-[15px] border-0 px-4 pt-3 pr-12 pb-20 focus-visible:ring-0"
                  disabled={isInputDisabled}
                  onKeyDown={(e) => {
                    // Handle autocomplete navigation
                    if (
                      autocompleteState.isOpen &&
                      (e.key === "ArrowDown" ||
                        e.key === "ArrowUp" ||
                        e.key === "Enter" ||
                        e.key === "Escape")
                    ) {
                      // Let the FileAutocomplete component handle these keys
                      return;
                    }

                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !autocompleteState.isOpen
                    ) {
                      e.preventDefault();
                      handleSendMessage(currentMessage);
                    }
                  }}
                  onBlur={() => {
                    // Close autocomplete when clicking outside, but with a small delay
                    // to allow for clicking on autocomplete items
                    setTimeout(() => {
                      closeAutocomplete();
                    }, 200);
                  }}
                />

                {/* Bottom Controls */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 border-t bg-background z-10">
                  <div className="flex items-center gap-2">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {/* Image upload button */}
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isInputDisabled}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Upload image"
                    >
                      <PhotoIcon className="w-5 h-5" />
                    </Button>

                    {/* Model Selector */}
                    <Select
                      value={modelProvider}
                      onValueChange={onModelProviderChange}
                    >
                      <SelectTrigger className="w-auto h-7 border-0 bg-transparent gap-1.5 px-2 hover:bg-accent/50 text-sm text-muted-foreground">
                        <CpuChipIcon className="w-4 h-4" />
                        <span>{getModelDisplayName(modelProvider)}</span>
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="anthropic" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                              <CpuChipIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">Sonnet 4.5</span>
                              <span className="text-xs text-muted-foreground">Best model from Anthropic</span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                              <CpuChipIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">GPT-5</span>
                              <span className="text-xs text-muted-foreground">The best model from OpenAI</span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="google" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                              <CpuChipIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">Gemini 2.5 Flash</span>
                              <span className="text-xs text-muted-foreground">Best model from Google</span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai-mini" className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                              <CpuChipIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">GPT-5 Nano</span>
                              <span className="text-xs text-muted-foreground">Smaller model from OpenAI</span>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Usage Count - hide temporarily */}
                    {/* {!loadingUsageCount && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`text-sm cursor-default ${userPlan === "free" && messageCount >= messageLimit
                              ? "text-destructive font-medium"
                              : "text-muted-foreground"
                              }`}
                          >
                            {messageCount}/{messageLimit}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {messageCount}/{messageLimit} messages used this billing period
                        </TooltipContent>
                      </Tooltip>
                    )} */}
                  </div>

                  {/* Send Button */}
                  <Button
                    onClick={() => {
                      handleSendMessage(currentMessage);
                    }}
                    disabled={isSendDisabled}
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-md hover:bg-accent disabled:opacity-50"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* File Autocomplete - positioned absolutely above textarea */}
              {autocompleteState.isOpen && (
                <div className="absolute bottom-full left-0 right-0 z-50 mb-1">
                  <FileAutocomplete
                    isOpen={autocompleteState.isOpen}
                    files={autocompleteState.filteredFiles}
                    searchTerm={autocompleteState.searchTerm}
                    onFileSelect={handleFileSelect}
                    onClose={closeAutocomplete}
                  />
                </div>
              )}
            </div>

            {isAtLimit && (
              <p className="text-sm text-destructive">
                You&apos;ve reached your message limit. Please upgrade to
                continue.
              </p>
            )}
            {DEBUG_MODE && (
              <div className="rounded border border-dashed border-muted p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Debug state</div>
                <ul className="list-disc pl-4">
                  {Object.entries(inputDisabledReasons).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-mono">{key}</span>: {String(value)}
                    </li>
                  ))}
                  <li>
                    <span className="font-mono">isSendDisabled</span>:{" "}
                    {String(isSendDisabled)}
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prototype Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prototype Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name Editing */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(event) => setEditedTitle(event.target.value)}
                    className="flex-1"
                    autoFocus
                    disabled={isUpdatingTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSaveTitle();
                      } else if (event.key === "Escape") {
                        handleCancelTitleEdit();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleSaveTitle}
                    disabled={isUpdatingTitle || !editedTitle.trim()}
                    className="h-9 w-9"
                  >
                    {isUpdatingTitle ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCancelTitleEdit}
                    disabled={isUpdatingTitle}
                    className="h-9 w-9"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center">
                  <p className="text-sm flex-1">{prototypeTitle}</p>
                  {canEditName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartTitleEdit}
                      className="h-8 w-8"
                      title="Edit prototype name"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Visibility Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Visibility</label>
              <div>
                <Badge variant="outline" className="uppercase tracking-wide">
                  {visibilityLabel}
                </Badge>
              </div>
            </div>

            {/* Created Date */}
            {createdAtLabel && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Created</label>
                <p className="text-sm text-muted-foreground">{createdAtLabel}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Chat Confirmation Dialog */}
      <Dialog open={showClearChatDialog} onOpenChange={setShowClearChatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to clear the chat? This will remove all
              messages and cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleClearChat}
                variant="destructive"
                className="flex-1"
              >
                Clear Chat
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowClearChatDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upsell Modal */}
      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="free_message_limit_reached"
        messageCount={messageCount}
        messageLimit={messageLimit}
      />
    </>
  );
}
