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
  SelectTrigger,
  SelectValue,
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
import {
  APIResponse,
  ChatErrorResponse,
  ChatRequestBody,
  CodeError,
  type CreatePrototypeErrorResponse,
  type CreatePrototypeRequestBody,
  type CreatePrototypeSuccessResponse,
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
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PhotoIcon,
  PlayIcon,
  ShareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  onShare?: () => void;

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
  onShare,
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
  const router = useRouter();
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [isCloningPrototype, setIsCloningPrototype] = useState(false);
  const [showCloneUpsellModal, setShowCloneUpsellModal] = useState(false);
  // UI state
  const [showClearChatDialog, setShowClearChatDialog] = useState(false);

  // Thoughts and execution plan state
  const [currentThought, setCurrentThought] = useState<string>("");
  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(false);
  const [executionPlan, setExecutionPlan] = useState<string[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [explicitlyCompletedSteps, setExplicitlyCompletedSteps] = useState<
    Set<number>
  >(new Set());

  // Image upload state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Use ref to avoid stale closure issues in streaming
  const prototypeChatSessionRef = useRef<PrototypeChatSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        // For user messages or first message, scroll to bottom to show the message
        // For AI messages, scroll to show the top of the message
        messagesEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: lastMessage.role === "user" ? "end" : "start"
        });
      }
    });
  }, [messages]);

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

  const handleClonePrototype = useCallback(async () => {
    if (!prototype) return;

    try {
      setIsCloningPrototype(true);
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: clonedPrototypeName,
            description: prototype.description,
            project_id: prototype.project_id || undefined,
            prototype_id: prototype.id,
            visibility: "PUBLIC",
          } as CreatePrototypeRequestBody),
        },
      );

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (result.data) {
        router.push(`/dashboard/prototypes/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        setShowCloneUpsellModal(true);
      } else if (result.error) {
        logger.debug("error", "Error cloning prototype:", {
          ...result.error,
        });
      }
    } catch (error) {
      logger.debug("error", "Error cloning prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsCloningPrototype(false);
    }
  }, [logger, prototype, router]);

  // Function to sanitize tool names for display
  const sanitizeToolName = (toolName: string): string => {
    const toolNameMap: Record<string, string> = {
      create_execution_plan: "Creating execution plan",
      edit_file: "Editing file",
      create_file: "Creating file",
      read_file: "Reading file",
      search_files: "Searching files",
      run_command: "Running command",
      deploy_preview: "Deploying preview",
      analyze_code: "Analyzing code",
      install_package: "Installing package",
      test_code: "Testing code",
      confirm_step_completion: "Completed step",
      append_file_content: "Adding content to file",
      replace_file_content: "Updating file content",
    };

    return (
      toolNameMap[toolName] || `Working with ${toolName.replace(/_/g, " ")}`
    );
  };

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

      // Then fetch the messages for this session and convert to ChatMessage format
      const { data: messagesData, error: messagesError } = await supabase
        .from("prototype_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSession.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (messagesError) {
        logger.debug("error", "Error fetching chat messages:", {
          ...messagesError,
        });
        return;
      }

      // Convert to ChatMessage format and reverse to get chronological order
      const chatMessages: ChatMessage[] = (messagesData?.reverse() || []).map(
        (msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
          imageUrl: msg.image_url || undefined,
        }),
      );
      setMessages(chatMessages);
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
            result?: {
              plan?: string[];
              step?: number;
              summary?: string;
              updatedFiles?: Record<string, PrototypeFile>;
            };
            updatedFiles?: string[] | Record<string, PrototypeFile>;
            updatedFilesObject?: Record<string, PrototypeFile>;
            deletedFiles?: string[];
            error?: string;
            messageCount?: number;
            viewing_url?: string;
            build_errors?: CodeError[];
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
            case "dispatch_start": {
              // Clear chat intent when build dispatch starts to prevent autoStartDevServer race condition
              // DO NOT MOVE THIS LINE TO AN EARLIER STEP. YOU **WILL** CAUSE A SEV.
              logger.debug("log", "received dispatch_start event");
              onCurrentRenderStatusChange("Updating..");
              clearChatIntent();
              break;
            }
            case "chat_response_delta":
              // Handle streaming text deltas
              const delta = String(event.content || "");
              chatResponseBuffer += delta;

              // Render progressively: append to last assistant message or create new one
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    ...last,
                    content: (last.content || "") + delta,
                  };
                  return copy;
                }
                return [...prev, { role: "assistant", content: delta }];
              });
              break;

            case "chat_response":
              // Handle final response (use chatResponseBuffer if content is empty)
              const finalContent = String(event.content || chatResponseBuffer);
              if (finalContent) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    const copy = [...prev];
                    copy[copy.length - 1] = {
                      ...last,
                      content: finalContent,
                    };
                    return copy;
                  }
                  return [
                    ...prev,
                    { role: "assistant", content: finalContent },
                  ];
                });
              }
              chatResponseBuffer = ""; // Reset buffer
              break;

            case "tool_call":
              // Update current thought instead of showing in chat
              const toolName = String(
                event.tool || event.toolName || "Unknown tool",
              );
              setCurrentThought(sanitizeToolName(toolName));
              setIsThoughtsExpanded(true);
              break;

            case "tool_result":
              // Update files if the tool result contains updated files
              // TODO (Priyam): This breaks because of streaming. Skip for now.
              // if (event.result?.updatedFiles) {
              //   onFilesUpdate({
              //     updatedFiles: event.result.updatedFiles,
              //     applyUpdatesToServer: true,
              //   });
              // }
              // Clear current thought when tool completes
              setCurrentThought("");
              break;

            case "execution_plan_created":
              // Set execution plan state instead of showing in chat
              const plan = event.result?.plan;
              if (plan && Array.isArray(plan)) {
                setExecutionPlan(plan);
                setCompletedSteps(new Set());
                setExplicitlyCompletedSteps(new Set());
                setIsThoughtsExpanded(true);
              }
              break;

            case "step_completed":
              // Mark step as completed instead of showing in chat
              const stepNum = event.result?.step;
              if (typeof stepNum === "number") {
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

            case "chat_complete":
              // Chat is finished - clear thoughts and close execution plan
              chatResponseBuffer = ""; // Reset buffer
              setCurrentThought("");
              setIsThoughtsExpanded(false);
              setIsChatLoading(false);
              break;

            case "usage_update":
              // Update the local message count with the value returned from the API
              if (typeof event.messageCount === "number") {
                setMessageCount(event.messageCount);
              }
              break;
            case "stream_complete":
              // Stream is finished
              chatResponseBuffer = "";
              setIsChatLoading(false);
              setIsThoughtsExpanded(false);
              setExecutionPlan([]);
              setCompletedSteps(new Set());
              setExplicitlyCompletedSteps(new Set());
              setCurrentThought("");
              break;
            case "viewing_url":
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
            case "files_synced":
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
            case "build_errors":
              setBuildErrors(event.build_errors || []);
              break;
            case "dispatch_error":
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `⚠️ **Preview Update Failed:** There was a problem updating the live preview.`,
                },
              ]);
              logger.debug("error", "Dispatch error from server:", {
                event,
              });
              setIsChatLoading(false);
              break;

            case "error":
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ **Error:** ${String(event.error || "Unknown error")}`,
                },
              ]);
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
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `❌ **Error:** Failed to upload image. ${uploadResult.error || "Please try again."}`,
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

      const newMessages = [...messages, userMessage];
      const serverMessages: ServerChatMessage[] = newMessages.map((msg) => ({
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
      setMessages(newMessages);
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

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I encountered an error.",
          },
        ]);
      } finally {
        setIsChatLoading(false);
        setIsConnected(false);
      }
    },
    [
      messages,
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
        setMessages([]);
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
        className="flex flex-col h-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      value={editedTitle}
                      onChange={(event) => setEditedTitle(event.target.value)}
                      className="h-9 w-56 md:w-64"
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
                      className="h-8 w-8"
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
                      className="h-8 w-8"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-foreground truncate max-w-xs md:max-w-sm">
                      {prototypeTitle}
                    </h2>
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
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {visibilityLabel}
                    </Badge>
                    {createdAtLabel && (
                      <span className="text-xs text-muted-foreground">
                        Created {createdAtLabel}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Select
                  value={modelProvider}
                  onValueChange={onModelProviderChange}
                >
                  <SelectTrigger className="w-[200px] h-8">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="anthropic">Claude Sonnet 4</SelectItem>
                    <SelectItem value="openai">GPT-5</SelectItem>
                    <SelectItem value="openai-mini">GPT-5 Nano</SelectItem>
                  </SelectContent>
                </Select>
                {buildErrors.length > 0 && (
                  <Button
                    onClick={handleInsertBuildErrors}
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <ExclamationTriangleIcon className="w-4 h-4 mr-2" />
                    {buildErrors.length} Error{buildErrors.length > 1 ? "s" : ""} Found
                  </Button>
                )}
                <TooltipProvider>
                  <div className="flex items-center gap-2">
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => onShare?.()}
                          variant="outline"
                          size="icon"
                          aria-label="Share prototype"
                        >
                          <ShareIcon className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Share prototype</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleClonePrototype}
                          variant="outline"
                          size="icon"
                          disabled={isCloningPrototype}
                          aria-label="Clone prototype"
                        >
                          {isCloningPrototype ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <DocumentDuplicateIcon className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clone prototype</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>

        {/* Usage indicator */}
        {!loadingUsageCount && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            {userPlan === "free" ? (
              <span
                className={
                  messageCount >= messageLimit
                    ? "text-destructive font-medium"
                    : ""
                }
              >
                {messageCount}/{messageLimit} messages used this billing period
              </span>
            ) : (
              <span>{messageCount} messages used this billing period</span>
            )}
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`max-w-[90%] rounded-lg p-3 ${message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                    }`}
                >
                  {/* Display image if available */}
                  {message.role === "user" && message.imageUrl && (
                    <ChatImage imageUrl={message.imageUrl} />
                  )}

                  <div
                    className={`text-sm prose prose-sm max-w-none ${message.role === "user"
                      ? "prose-invert [&>*]:text-primary-foreground"
                      : "prose-slate dark:prose-invert"
                      } [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:mb-2 [&>h2]:mb-2 [&>h3]:mb-2 [&>blockquote]:mb-2 [&>pre]:mb-2 [&>strong]:text-current [&>em]:text-current [&>code]:text-current`}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isChatLoading && isConnected && !currentThought && (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-lg p-3 bg-muted">
                  <div className="text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              </div>
            )}
            {/* Invisible element at the end for scrolling */}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Thoughts and Execution Plan Section */}
        {(currentThought || executionPlan.length > 0) && (
          <div className="border-t border-b bg-muted/30">
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
                className="w-full justify-between text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                  {currentThought || "Waiting..."}
                </span>
                {isThoughtsExpanded ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
              </Button>

              {isThoughtsExpanded && (
                <div className="mt-3 space-y-3">
                  {executionPlan.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Execution Plan:</div>
                      <div className="space-y-1">
                        {executionPlan.map((step, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${completedSteps.has(index)
                                ? "border-green-500 bg-green-500"
                                : "border-gray-300"
                                }`}
                            >
                              {completedSteps.has(index) && (
                                <div className="relative">
                                  <CheckIcon className="w-3 h-3 text-white" />
                                  {!explicitlyCompletedSteps.has(index) && (
                                    <span className="absolute -top-1 -right-1 text-white text-xs font-bold">
                                      *
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span
                              className={`${completedSteps.has(index)
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                                }`}
                            >
                              {step}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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
        <div className="p-4 border-t">
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
              <Textarea
                ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                value={currentMessage}
                onChange={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  handleTextareaChange(e.target.value, target.selectionStart);
                }}
                placeholder="Type your message... Use @filename to reference files"
                className="min-h-[120px] resize-none text-base"
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
            <div className="flex gap-2">
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
                variant="outline"
                size="icon"
                title="Upload image"
              >
                <PhotoIcon className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => {
                  handleSendMessage(currentMessage);
                }}
                disabled={isSendDisabled}
                className="flex-1"
              >
                <PlayIcon className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </div>
            {isAtLimit && (
              <p className="text-sm text-destructive">
                You&apos;ve reached your message limit. Please upgrade to
                continue.
              </p>
            )}
            {isDevServerNotReady && !isAtLimit && (
              <p className="text-sm text-muted-foreground">
                Waiting for dev server to connect... ({currentRenderStatus})
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
      <ProPlanUpsellModal
        open={showCloneUpsellModal}
        onOpenChange={setShowCloneUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </>
  );
}
