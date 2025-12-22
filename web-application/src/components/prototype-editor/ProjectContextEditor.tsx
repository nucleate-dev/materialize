"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseFileSystemReturn } from "@/hooks/useFileSystem";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import Editor from "@monaco-editor/react";
import { FileText, Loader2, Lock, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";

interface ProjectContextEditorProps {
  fileSystem: UseFileSystemReturn;
  prototypeId: string;
  readOnly?: boolean;
}

const CLAUDE_MD_FILENAME = "CLAUDE.md";

const DEFAULT_TEMPLATE = `# Project Context

Add instructions for the AI here. This context will be used to guide code generation.

## Guidelines
-
`;

const ProjectContextEditor: React.FC<ProjectContextEditorProps> = ({
  fileSystem,
  prototypeId,
  readOnly = false,
}) => {
  const logger = useProductLogger();
  const router = useRouter();
  const { userPlan } = useSubscriptionAccess();

  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [localContent, setLocalContent] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const claudeMdFile = fileSystem.state.files[CLAUDE_MD_FILENAME];
  const fileExists = Boolean(claudeMdFile);

  // Sync local content with file system content
  useEffect(() => {
    if (claudeMdFile) {
      setLocalContent(claudeMdFile.contents || "");
      setHasUnsavedChanges(false);
    }
  }, [claudeMdFile]);

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (userPlan === "free") return;
      if (value !== undefined) {
        setLocalContent(value);
        setHasUnsavedChanges(value !== (claudeMdFile?.contents || ""));
      }
    },
    [userPlan, claudeMdFile],
  );

  const handleSave = useCallback(async () => {
    if (!prototypeId || !fileExists) return;

    setIsSaving(true);
    try {
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [{ name: CLAUDE_MD_FILENAME, content: localContent }],
      });

      if (result.success) {
        setHasUnsavedChanges(false);
        logger.debug("log", "CLAUDE.md saved successfully");
      }
    } catch (error) {
      logger.debug("error", "Error saving CLAUDE.md:", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }, [prototypeId, fileExists, fileSystem, localContent, logger]);

  const handleCreateFile = useCallback(async () => {
    if (!prototypeId || userPlan === "free") return;

    setIsCreating(true);
    try {
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [{ name: CLAUDE_MD_FILENAME, content: DEFAULT_TEMPLATE }],
      });

      if (result.success) {
        setLocalContent(DEFAULT_TEMPLATE);
        logger.debug("log", "CLAUDE.md created successfully");
      }
    } catch (error) {
      logger.debug("error", "Error creating CLAUDE.md:", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCreating(false);
    }
  }, [prototypeId, userPlan, fileSystem, logger]);

  // Monaco editor configuration
  const beforeMount = (monaco: typeof import("monaco-editor")) => {
    monaco.editor.defineTheme("materialize-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0B0C0E",
        "editor.lineHighlightBackground": "#141517",
        "editorGutter.background": "#0B0C0E",
        "editorIndentGuide.background": "#FFFFFF10",
        "scrollbarSlider.background": "#FFFFFF10",
        "scrollbarSlider.hoverBackground": "#FFFFFF20",
        "scrollbarSlider.activeBackground": "#FFFFFF30",
      },
    });
  };

  // Empty state - file doesn't exist
  if (!fileExists) {
    return (
      <div className="h-full flex flex-col bg-background text-foreground">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center border border-indigo-500/20">
              <FileText className="w-8 h-8 text-indigo-500/50" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No project context
              </h3>
              <p className="text-sm text-muted-foreground">
                Create a CLAUDE.md file to provide AI instructions and project
                context that guides code generation.
              </p>
            </div>
            <Button
              onClick={handleCreateFile}
              disabled={isCreating || userPlan === "free"}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create CLAUDE.md
                </>
              )}
            </Button>
            {userPlan === "free" && (
              <p className="text-xs text-amber-500/80">
                Upgrade to Plus to create project context files
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Editor view - file exists
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background text-foreground">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-accent/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-accent border border-border">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="text-sm font-medium tracking-tight text-foreground">
              {CLAUDE_MD_FILENAME}
            </span>
            {hasUnsavedChanges && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-500 rounded uppercase tracking-wider font-semibold">
                Unsaved
              </span>
            )}
            {readOnly && (
              <span className="px-1.5 py-0.5 text-[10px] bg-accent text-muted-foreground rounded uppercase tracking-wider font-semibold">
                Read Only
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!readOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                      isSaving && "text-indigo-400 animate-pulse",
                      userPlan === "free" &&
                        "opacity-30 cursor-not-allowed hover:bg-transparent",
                    )}
                    onClick={handleSave}
                    disabled={isSaving || userPlan === "free" || !hasUnsavedChanges}
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-accent border-border text-xs"
                >
                  <p>
                    {userPlan === "free"
                      ? "Upgrade to save"
                      : hasUnsavedChanges
                        ? "Save changes"
                        : "No changes to save"}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Free Plan Banner */}
          {userPlan === "free" && (
            <div className="absolute top-0 left-0 right-0 z-20 bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-md px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-3 h-3 text-amber-500" />
                <span className="text-xs text-amber-200/80 font-medium">
                  Read-only mode
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/20 rounded-full"
                onClick={() => handleCheckout("plus", router)}
              >
                Upgrade Plan
              </Button>
            </div>
          )}

          <div className="flex-1 h-full relative">
            <Editor
              height="100%"
              language="markdown"
              value={localContent}
              onChange={handleContentChange}
              theme="materialize-dark"
              beforeMount={beforeMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                folding: true,
                padding: { top: 16, bottom: 16 },
                renderLineHighlight: "line",
                readOnly: readOnly || userPlan === "free",
                contextmenu: !(readOnly || userPlan === "free"),
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                scrollbar: {
                  vertical: "visible",
                  horizontal: "visible",
                  useShadows: false,
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                },
              }}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ProjectContextEditor;
