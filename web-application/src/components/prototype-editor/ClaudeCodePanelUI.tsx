"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import ProjectContextEditor from "@/components/prototype-editor/ProjectContextEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { UseFileSystemReturn } from "@/hooks/useFileSystem";
import { cn } from "@/lib/classNames"; // Assuming cn utility exists
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Copy,
  Edit2,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus, Send,
  Sparkles,
  StopCircle,
  Terminal,
  Undo2,
  X
} from "lucide-react";
import type {
  ChangeEvent,
  KeyboardEvent,
  MutableRefObject,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type {
  ClaudeCodePanelActiveView, Message,
  PrototypeChatSession,
  Todo,
  UploadedImage
} from "./ClaudeCodePanel";

interface ClaudeCodePanelUIProps {
  prototypeId: string;
  prototypeTitle: string;
  visibilityLabel: string;
  createdAtLabel: string | null;
  canEditName: boolean;
  isEditingTitle: boolean;
  editedTitle: string;
  isUpdatingTitle: boolean;
  showSettingsModal: boolean;
  setShowSettingsModal: (open: boolean) => void;
  showResetConfirmation: boolean;
  setShowResetConfirmation: (open: boolean) => void;
  allChatSessions: PrototypeChatSession[];
  prototypeChatSessionId: string | null;
  isConnected: boolean;
  isProcessing: boolean;
  baseTunnelUrl: string | null;
  currentRenderStatus?: RenderStatus;
  modelProvider: "claude" | "vercel";
  model: string;
  vercelModels: Array<{ value: string; label: string; }>;
  onModelProviderChange: (value: "claude" | "vercel") => void;
  onModelChange: (value: string) => void;
  messages: Message[];
  expandedThinking: Set<string>;
  currentTodos: Todo[];
  uploadedImages: UploadedImage[];
  inputValue: string;
  hasReceivedResponse: boolean;
  showScrollToBottom: boolean;
  isCurrentSessionMostRecent: boolean;
  isDragOver: boolean;
  uploadingImages: boolean;
  uploadProgress: { [key: string]: number; };
  scrollAreaRef:
  | RefObject<HTMLDivElement | null>
  | MutableRefObject<HTMLDivElement | null>;
  fileInputRef:
  | RefObject<HTMLInputElement | null>
  | MutableRefObject<HTMLInputElement | null>;
  textareaRef:
  | RefObject<HTMLTextAreaElement | null>
  | MutableRefObject<HTMLTextAreaElement | null>;
  handleStartTitleEdit: () => void;
  handleCancelTitleEdit: () => void;
  handleSaveTitle: () => void;
  setEditedTitle: (value: string) => void;
  switchChatSession: (value: string) => void;
  createNewChatSession: () => void;
  connect: () => void;
  interruptQuery: () => void;
  toggleThinkingExpanded: (toolCallId: string) => void;
  getRelativeTime: (timestamp: number) => string;
  sanitizeFilePath: (path: string) => string;
  removeImage: (imageId: string) => void;
  handleImageSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  setInputValue: (value: string) => void;
  handleKeyPress: (event: KeyboardEvent) => void;
  sendQuery: () => void;
  resetSession: () => void;
  scrollToBottom: () => void;
  handleDragEnter: (event: React.DragEvent) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handlePaste: (event: React.ClipboardEvent) => void;
  hasReachedCreditLimit: boolean;
  creditsUsed: number;
  totalAvailableCredits: number;
  onUndo: () => void;
  onMessageUpdate?: (message: Message) => void;
  // View toggle and context editor props
  activeView: ClaudeCodePanelActiveView;
  onActiveViewChange: (view: ClaudeCodePanelActiveView) => void;
  fileSystem?: UseFileSystemReturn;
}

function CopyMessageButton({ content }: { content: string; }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    toast.success("Copied message!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "transition-colors",
        isCopied
          ? "text-green-500 hover:text-green-600"
          : "text-muted-foreground hover:text-foreground"
      )}
      title="Copy message"
    >
      {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function ClaudeCodePanelUI({
  prototypeId,
  prototypeTitle,
  visibilityLabel,
  createdAtLabel,
  canEditName,
  isEditingTitle,
  editedTitle,
  isUpdatingTitle,
  showSettingsModal,
  setShowSettingsModal,
  showResetConfirmation,
  setShowResetConfirmation,
  allChatSessions,
  prototypeChatSessionId,
  isConnected,
  isProcessing,
  // baseTunnelUrl, currentRenderStatus, modelProvider, model, vercelModels,
  // onModelProviderChange, onModelChange are available via props if needed
  messages,
  expandedThinking,
  currentTodos,
  uploadedImages,
  inputValue,
  hasReceivedResponse,
  showScrollToBottom,
  isCurrentSessionMostRecent,
  isDragOver,
  uploadingImages,
  uploadProgress,
  scrollAreaRef,
  fileInputRef,
  textareaRef,
  handleStartTitleEdit,
  handleCancelTitleEdit,
  handleSaveTitle,
  setEditedTitle,
  switchChatSession,
  createNewChatSession,
  // connect is available via props if needed
  interruptQuery,
  toggleThinkingExpanded,
  getRelativeTime,
  sanitizeFilePath,
  removeImage,
  handleImageSelect,
  setInputValue,
  handleKeyPress,
  sendQuery,
  resetSession,
  scrollToBottom,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handlePaste,
  hasReachedCreditLimit,
  creditsUsed,
  totalAvailableCredits,
  onUndo,
  onMessageUpdate,
  activeView,
  onActiveViewChange,
  fileSystem,
}: ClaudeCodePanelUIProps) {
  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const hasShownModalRef = useRef(false);

  // Show modal when credit limit is reached, but only once per session
  useEffect(() => {
    if (hasReachedCreditLimit && !hasShownModalRef.current) {
      setShowCreditLimitModal(true);
      hasShownModalRef.current = true;
    }
  }, [hasReachedCreditLimit]);

  const sanitizeText = (text: string) =>
    text
      .replace(/Claude Code/g, "Nucleate")
      .replace(/\/tmp\/materialize-dev-server/g, "");

  return (
    <div
      className="flex flex-col h-full bg-background border-l border-border relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-sm z-50 flex items-center justify-center border-2 border-dashed border-indigo-500 pointer-events-none">
          <div className="bg-background/90 rounded-2xl px-8 py-6 shadow-2xl border border-indigo-500/20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Paperclip className="w-8 h-8 text-indigo-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground mb-1">
                  Drop images here
                </p>
                <p className="text-sm text-muted-foreground">
                  Upload images to attach to your message
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Header --- */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-accent/50 h-14 shrink-0">
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="text-sm font-medium text-foreground truncate max-w-[120px]"
              title={prototypeTitle}
            >
              {prototypeTitle}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setShowSettingsModal(true)}
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* View Toggle - Chat / Context */}
          {fileSystem && (
            <div className="bg-accent p-0.5 rounded-lg border border-border flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onActiveViewChange("chat")}
                className={cn(
                  "h-6 px-2 text-xs rounded-md",
                  activeView === "chat"
                    ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent",
                )}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                Chat
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onActiveViewChange("context")}
                className={cn(
                  "h-6 px-2 text-xs rounded-md",
                  activeView === "context"
                    ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent",
                )}
              >
                <FileText className="w-3 h-3 mr-1" />
                Context
              </Button>
            </div>
          )}

          {/* Session Selector */}
          {allChatSessions.length > 0 && (
            <div className="hidden sm:block">
              <Select
                value={
                  prototypeChatSessionId
                    ? String(prototypeChatSessionId)
                    : undefined
                }
                onValueChange={(value) => switchChatSession(value)}
              >
                <SelectTrigger className="w-[140px] h-7 text-xs bg-background border-border text-foreground focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  {allChatSessions.map((session) => {
                    const date = new Date(session.created_at ?? new Date());
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const dateStr = isToday
                      ? "Today"
                      : date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                    const timeStr = date.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    return (
                      <SelectItem
                        key={session.id}
                        value={String(session.id)}
                        className="text-xs cursor-pointer"
                      >
                        {dateStr}, {timeStr}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* New Chat Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={createNewChatSession}
                  disabled={!isConnected}
                  className="h-7 w-7 text-muted-foreground hover:text-indigo-600"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-1">
          {/* Undo Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onUndo}
                  disabled={!isConnected || isProcessing}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo Last Change</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Credits Indicator */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent cursor-default">
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="text-xs">
                  {creditsUsed} / {totalAvailableCredits} credits used
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Reconnect Button */}
          {/* {!isConnected &&
            baseTunnelUrl &&
            currentRenderStatus !== "Starting Dev Server.." && (
              <Button
                size="sm"
                variant="default"
                onClick={connect}
                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Reconnect
              </Button>
            )} */}

          {/* <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowResetConfirmation(true)}
                  disabled={!prototypeChatSessionId || isProcessing}
                  className="h-7 w-7 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Session</TooltipContent>
            </Tooltip>
          </TooltipProvider> */}
        </div>
      </div>

      {/* Context Editor View */}
      {activeView === "context" && fileSystem && (
        <div className="flex-1 min-h-0">
          <ProjectContextEditor
            fileSystem={fileSystem}
            prototypeId={prototypeId}
          />
        </div>
      )}

      {/* Chat View */}
      {activeView === "chat" && (
        <>
          {/* --- Messages Area --- */}
          <ScrollArea
            className="flex-1 px-4 relative bg-accent/20"
            ref={scrollAreaRef}
          >
            <div className="py-4 space-y-3 max-w-3xl mx-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-center opacity-0 animate-in fade-in duration-700">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                    <Sparkles className="w-8 h-8 text-indigo-500/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    How can I help you build?
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Ask me to create a screen, generate components, or refactor your
                    code.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "group flex flex-col gap-0.5",
                        message.type === "user" ? "items-end" : "items-start",
                      )}
                    >
                      {/* User Message */}
                      {message.type === "user" && (
                        <div className="relative max-w-[85%]">
                          <div
                            className={cn(
                              "rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm border",
                              message.isQueued
                                ? "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100"
                                : "bg-white dark:bg-slate-800 border-border text-foreground",
                            )}
                          >
                            {message.isQueued && (
                              <div className="flex items-center gap-2 mb-2 text-xs font-medium opacity-80 pb-2 border-b border-amber-200/50">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Queued - waiting for connection</span>
                              </div>
                            )}
                            <pre className="whitespace-pre-wrap break-words font-sans">
                              {sanitizeText(message.content)}
                            </pre>

                            {/* User Images */}
                            {message.imageUrls && message.imageUrls.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {message.imageUrls.map((imageUrl, idx) => (
                                  <div
                                    key={idx}
                                    className="relative rounded-lg overflow-hidden border border-border group/img"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={imageUrl}
                                      alt={`User upload ${idx + 1}`}
                                      className="h-16 w-auto object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                      onClick={() =>
                                        window.open(imageUrl, "_blank")
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyMessageButton content={message.content} />
                            <span className="text-[10px] text-muted-foreground">
                              {getRelativeTime(message.timestamp)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Assistant Message */}
                      {message.type === "assistant" && (
                        <div className="w-full max-w-none px-1">
                          <div
                            className="prose prose-sm prose-gray dark:prose-invert max-w-none break-words
                        prose-pre:bg-accent/50
                        prose-pre:border prose-pre:border-border
                        prose-code:text-indigo-600 dark:prose-code:text-indigo-400
                        prose-code:bg-indigo-50 dark:prose-code:bg-indigo-950/50 prose-code:px-1 prose-code:rounded
                        prose-code:before:content-none prose-code:after:content-none"
                          >
                            <ReactMarkdown>
                              {sanitizeText(message.content)}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Tool Status */}
                      {message.type === "tool" && (
                        <div className="flex items-center gap-2 px-3 py-1.5 my-0.5 rounded-md bg-accent/50 border border-border w-fit max-w-full">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              message.status === "error"
                                ? "bg-red-500"
                                : message.status === "running"
                                  ? "bg-indigo-500 animate-pulse"
                                  : "bg-emerald-500",
                            )}
                          />
                          <code className="text-xs font-mono text-muted-foreground truncate max-w-[200px] sm:max-w-md">
                            {sanitizeText(message.content)}
                          </code>
                          {message.status === "running" && (
                            <Loader2 className="w-3 h-3 text-muted-foreground animate-spin ml-1" />
                          )}
                          {message.status === "success" && (
                            <Check className="w-3 h-3 text-emerald-500 ml-1" />
                          )}
                          {message.status === "error" && (
                            <X className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                      )}

                      {/* Thinking Process (Collapsible) */}
                      {message.type === "thinking" && (
                        <div className="w-full my-0.5">
                          <div
                            onClick={() =>
                              message.toolCallId &&
                              toggleThinkingExpanded(message.toolCallId)
                            }
                            className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent/50 rounded-md transition-colors w-fit select-none"
                          >
                            <div className="text-muted-foreground">
                              {message.toolCallId &&
                                expandedThinking.has(message.toolCallId) ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Terminal className="w-3.5 h-3.5" />
                              <span className="font-medium tracking-tight">
                                {message.status === "running"
                                  ? "Processing..."
                                  : "Thought process"}
                              </span>
                            </div>
                          </div>

                          {message.toolCallId &&
                            expandedThinking.has(message.toolCallId) && (
                              <div className="ml-2 pl-4 border-l border-border mt-0.5 py-0.5">
                                <div className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed bg-accent/50 p-2.5 rounded-md border border-border">
                                  {sanitizeText(message.content)}
                                  {message.toolInput && (
                                    <div className="mt-3 pt-3 border-t border-dashed border-border">
                                      {message.toolInput.prompt && (
                                        <div className="mb-1">
                                          <span className="text-indigo-500">
                                            prompt:
                                          </span>{" "}
                                          {sanitizeFilePath(
                                            message.toolInput.prompt,
                                          )}
                                        </div>
                                      )}
                                      {message.toolInput.model && (
                                        <div>
                                          <span className="text-purple-500">
                                            model:
                                          </span>{" "}
                                          {message.toolInput.model}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Error Toast Style */}
                      {message.type === "error" && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                          <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>{sanitizeText(message.content)}</div>
                        </div>
                      )}

                      {/* Usage Message */}
                      {message.type === "usage" && (
                        <div className="text-xs text-muted-foreground/60 px-1">
                          {sanitizeText(message.content)}
                        </div>
                      )}

                      {/* Design Spec Message - Collapsible */}
                      {message.type === "design_spec" && (
                        <div className="w-full">
                          <div
                            className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:bg-purple-500/15 transition-colors"
                            onClick={() => {
                              onMessageUpdate?.({
                                ...message,
                                isCollapsed: !message.isCollapsed,
                              });
                            }}
                          >
                            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            <div className="flex-1 text-sm font-medium text-purple-600 dark:text-purple-400">
                              {sanitizeText(message.content)}
                            </div>
                            {message.isCollapsed ? (
                              <ChevronDown className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            ) : (
                              <ChevronUp className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            )}
                          </div>
                          {!message.isCollapsed && message.designSpec && (
                            <div className="mt-2 p-4 rounded-lg bg-muted/30 border border-border/50 text-sm whitespace-pre-wrap font-mono text-foreground/80 max-h-96 overflow-y-auto">
                              {message.designSpec}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Active Thinking Indicator */}
                  {isProcessing && isConnected && !hasReceivedResponse && (
                    <div className="flex items-center gap-2 px-1 py-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground animate-pulse">
                        Thinking...
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Bottom Spacer */}
              <div className="h-2" />
            </div>

            {/* Scroll To Bottom Fab */}
            {showScrollToBottom && isCurrentSessionMostRecent && (
              <div className="sticky bottom-4 flex justify-center w-full z-10 pointer-events-none">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={scrollToBottom}
                  className="pointer-events-auto rounded-full h-8 px-4 bg-background border-border shadow-lg hover:shadow-xl text-xs font-medium text-foreground"
                >
                  <ArrowDown className="w-3.5 h-3.5 mr-2" />
                  Scroll to bottom
                </Button>
              </div>
            )}

            {/* History Banner */}
            {!isCurrentSessionMostRecent && (
              <div className="absolute bottom-6 left-0 right-0 z-20 px-6 flex justify-center">
                <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-full border border-amber-200 backdrop-blur-md shadow-lg text-xs font-medium flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" />
                  Viewing past session. Start a new chat to interact.
                </div>
              </div>
            )}
          </ScrollArea>

          {/* --- TODO / Active Task Panel --- */}
          {currentTodos.length > 0 &&
            currentTodos.some((t) => t.status !== "completed") &&
            isCurrentSessionMostRecent && (
              <div className="px-4 pt-3 pb-1 bg-accent/20 border-t border-border">
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      Current Tasks
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {currentTodos.filter((t) => t.status === "completed").length}/
                      {currentTodos.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {currentTodos.map((todo, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex gap-2 text-xs items-start",
                          todo.status === "completed"
                            ? "opacity-50"
                            : "opacity-100",
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {todo.status === "completed" ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                            </div>
                          ) : todo.status === "in_progress" ? (
                            <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-border" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "leading-tight",
                            todo.status === "completed"
                              ? "line-through text-muted-foreground"
                              : "text-foreground",
                          )}
                        >
                          {todo.status === "in_progress"
                            ? todo.activeForm
                            : todo.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {/* --- Input Area --- */}
          <div className="p-4 bg-background border-t border-border">
            {/* Uploaded Images Preview */}
            {uploadedImages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {uploadedImages.map((image) => (
                  <div key={image.id} className="relative group shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${image.mediaType};base64,${image.base64}`}
                      alt={image.name}
                      className="h-14 w-14 object-cover rounded-md border border-border"
                    />
                    <button
                      onClick={() => removeImage(image.id)}
                      className="absolute -top-1.5 -right-1.5 bg-background text-muted-foreground rounded-full p-0.5 border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Progress Indicator */}
            {uploadingImages && (
              <div className="mb-3 p-3 rounded-lg bg-accent/50 border border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading images...</span>
                </div>
                {Object.entries(uploadProgress).map(([id, progress]) => (
                  <div key={id} className="mt-1">
                    <div className="h-1.5 w-full bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 bg-accent/50 p-2 rounded-xl border border-border focus-within:ring-1 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50 transition-all shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || !isCurrentSessionMostRecent}
                      className="h-9 w-9 mb-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <Paperclip className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach Images</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                onPaste={handlePaste}
                placeholder={
                  !isCurrentSessionMostRecent
                    ? "Session is read-only"
                    : "Ask Nucleate to edit code..."
                }
                disabled={isProcessing || !isCurrentSessionMostRecent}
                className="flex-1 min-h-[44px] max-h-32 bg-transparent border-0 focus-visible:ring-0 p-2.5 text-sm resize-none placeholder:text-muted-foreground text-foreground"
                rows={1}
              />

              <Button
                onClick={isProcessing ? interruptQuery : sendQuery}
                disabled={
                  !isProcessing &&
                  ((!inputValue.trim() && uploadedImages.length === 0) ||
                    !isCurrentSessionMostRecent)
                }
                size="icon"
                className={cn(
                  "h-9 w-9 mb-0.5 rounded-lg transition-all",
                  isProcessing
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-md"
                    : (!inputValue.trim() && uploadedImages.length === 0) ||
                      !isCurrentSessionMostRecent
                      ? "bg-accent text-muted-foreground"
                      : "bg-black dark:bg-white text-white dark:text-black hover:opacity-90 shadow-md",
                )}
              >
                {isProcessing ? (
                  <StopCircle className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* --- Settings Modal --- */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-md bg-background border-border text-foreground">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle>Project Details</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project Name
              </label>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(event) => setEditedTitle(event.target.value)}
                    className="flex-1 bg-accent/50 border-border"
                    autoFocus
                    disabled={isUpdatingTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSaveTitle();
                      } else if (event.key === "Escape")
                        handleCancelTitleEdit();
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleSaveTitle}
                    disabled={isUpdatingTitle || !editedTitle.trim()}
                    className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    {isUpdatingTitle ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCancelTitleEdit}
                    disabled={isUpdatingTitle}
                    className="h-9 w-9 border-border"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border border-border">
                  <span className="text-sm font-medium">{prototypeTitle}</span>
                  {canEditName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartTitleEdit}
                      className="h-6 w-6 text-muted-foreground hover:text-indigo-500"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Visibility
                </label>
                <div className="flex">
                  <Badge
                    variant="outline"
                    className="bg-accent/50 border-border text-foreground"
                  >
                    {visibilityLabel}
                  </Badge>
                </div>
              </div>
              {createdAtLabel && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Created
                  </label>
                  <p className="text-sm text-foreground font-mono">
                    {createdAtLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Model / Provider */}
            {/* <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Model Provider
                </label>
                <Select
                  value={modelProvider}
                  onValueChange={(value) =>
                    onModelProviderChange(value as "claude" | "vercel")
                  }
                >
                  <SelectTrigger className="w-full bg-accent/50 border-border">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="claude" className="text-sm">
                      Claude (default)
                    </SelectItem>
                    <SelectItem value="vercel" className="text-sm">
                      Vercel AI (OpenAI/Google)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {modelProvider === "vercel" && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Model
                  </label>
                  <Select value={model} onValueChange={(value) => onModelChange(value)}>
                    <SelectTrigger className="w-full bg-accent/50 border-border">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      {vercelModels.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="text-sm"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Switching providers or models starts a fresh chat session automatically.
              </p>
            </div> */}
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Reset Confirmation --- */}
      <Dialog
        open={showResetConfirmation}
        onOpenChange={setShowResetConfirmation}
      >
        <DialogContent className="sm:max-w-md bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <CircleAlert className="w-5 h-5" /> Reset Session?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will clear the current conversation history and context. Your
              project files will not be deleted, but the AI will lose memory of
              previous messages in this session.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowResetConfirmation(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowResetConfirmation(false);
                resetSession();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Reset Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Limit Paywall Modal */}
      <ProPlanUpsellModal
        open={showCreditLimitModal}
        onOpenChange={setShowCreditLimitModal}
        reason="free_message_limit_reached"
        creditsUsed={creditsUsed}
        creditLimit={totalAvailableCredits}
      />
    </div>
  );
}
