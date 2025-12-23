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
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll } from "@milkdown/utils";
import { FileText, Loader2, Lock, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const initialContentRef = useRef<string>("");

  const claudeMdFile = fileSystem.state.files[CLAUDE_MD_FILENAME];
  const fileExists = Boolean(claudeMdFile);
  const isReadOnly = readOnly || userPlan === "free";

  // Get current content from editor (with safety check)
  const getEditorContent = useCallback((): string => {
    if (crepeRef.current && isEditorReady) {
      try {
        return crepeRef.current.getMarkdown();
      } catch {
        return initialContentRef.current;
      }
    }
    return initialContentRef.current;
  }, [isEditorReady]);

  // Initialize Milkdown editor
  useEffect(() => {
    if (!fileExists || !editorContainerRef.current) return;

    const content = claudeMdFile?.contents || "";
    initialContentRef.current = content;

    const crepe = new Crepe({
      root: editorContainerRef.current,
      defaultValue: content,
      features: {
        [Crepe.Feature.CodeMirror]: false, // Disable code mirror for simpler experience
        [Crepe.Feature.Latex]: false, // Disable LaTeX (requires CodeMirror)
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: false, // No images in context file
        [Crepe.Feature.BlockEdit]: false, // Disable block handles to reduce padding
        [Crepe.Feature.Toolbar]: !isReadOnly,
        [Crepe.Feature.Placeholder]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start typing your project context...",
        },
      },
    });

    crepe.create().then(() => {
      crepeRef.current = crepe;
      setIsEditorReady(true);

      // Set up change listener
      crepe.on((listener) => {
        listener.markdownUpdated((_, markdown) => {
          const hasChanges = markdown !== initialContentRef.current;
          setHasUnsavedChanges(hasChanges);
        });
      });

      // Apply read-only mode
      if (isReadOnly) {
        crepe.setReadonly(true);
      }
    });

    return () => {
      crepe.destroy();
      crepeRef.current = null;
      setIsEditorReady(false);
    };
  }, [fileExists, claudeMdFile?.contents, isReadOnly]);

  // Sync content when file changes externally
  useEffect(() => {
    if (crepeRef.current && isEditorReady && claudeMdFile?.contents !== undefined) {
      try {
        const currentContent = getEditorContent();
        if (claudeMdFile.contents !== currentContent && claudeMdFile.contents !== initialContentRef.current) {
          // File changed externally, update editor using replaceAll action
          initialContentRef.current = claudeMdFile.contents;
          crepeRef.current.editor.action(replaceAll(claudeMdFile.contents));
          setHasUnsavedChanges(false);
        }
      } catch {
        // Editor not ready yet, ignore
      }
    }
  }, [claudeMdFile?.contents, getEditorContent, isEditorReady]);

  const handleSave = useCallback(async () => {
    if (!prototypeId || !fileExists || !crepeRef.current) return;

    setIsSaving(true);
    try {
      const content = getEditorContent();
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [{ name: CLAUDE_MD_FILENAME, content }],
      });

      if (result.success) {
        initialContentRef.current = content;
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
  }, [prototypeId, fileExists, fileSystem, getEditorContent, logger]);

  const handleCreateFile = useCallback(async () => {
    if (!prototypeId || userPlan === "free") return;

    setIsCreating(true);
    try {
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [{ name: CLAUDE_MD_FILENAME, content: DEFAULT_TEMPLATE }],
      });

      if (result.success) {
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
            {isReadOnly && (
              <span className="px-1.5 py-0.5 text-[10px] bg-accent text-muted-foreground rounded uppercase tracking-wider font-semibold">
                Read Only
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isReadOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                      isSaving && "text-indigo-400 animate-pulse",
                    )}
                    onClick={handleSave}
                    disabled={isSaving || !hasUnsavedChanges}
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-accent border-border text-xs"
                >
                  <p>
                    {hasUnsavedChanges ? "Save changes" : "No changes to save"}
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

          {/* Milkdown Editor Container */}
          <div
            ref={editorContainerRef}
            className={cn(
              "flex-1 h-full overflow-auto milkdown-editor",
              userPlan === "free" && "pt-10",
              !isEditorReady && "opacity-0",
            )}
          />

          {/* Loading state */}
          {!isEditorReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Custom styles for Milkdown - theme-aware */}
      <style jsx global>{`
        .milkdown-editor {
          --crepe-color-background: hsl(var(--background));
          --crepe-color-surface: hsl(var(--accent));
          --crepe-color-overlay: hsl(var(--muted));
          --crepe-color-primary: #6366f1;
          --crepe-color-secondary: #8b5cf6;
          --crepe-color-solid: hsl(var(--foreground));
          --crepe-color-line: hsl(var(--border));
          --crepe-color-border: hsl(var(--border));
          --crepe-color-hover: hsl(var(--accent));
          --crepe-color-muted: hsl(var(--muted-foreground));
          --crepe-font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          --crepe-font-code: 'JetBrains Mono', 'Fira Code', monospace;
        }

        .milkdown-editor .milkdown {
          background: var(--crepe-color-background);
          color: var(--crepe-color-solid);
          min-height: 100%;
          padding: 0.75rem 1rem;
        }

        .milkdown-editor .editor {
          outline: none;
        }

        .milkdown-editor .ProseMirror,
        .milkdown-editor .milkdown .ProseMirror {
          outline: none;
          min-height: 200px;
          caret-color: var(--crepe-color-solid);
          padding: 16px 24px !important;
        }

        .milkdown-editor .ProseMirror > *:first-child {
          margin-top: 0 !important;
        }

        .milkdown-editor .ProseMirror:focus {
          outline: none;
        }

        .milkdown-editor .ProseMirror p {
          margin: 0.35em 0;
          line-height: 1.6;
        }

        .milkdown-editor .ProseMirror h1,
        .milkdown-editor .ProseMirror h2,
        .milkdown-editor .ProseMirror h3 {
          color: var(--crepe-color-solid);
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.35em;
        }

        .milkdown-editor .ProseMirror h1 {
          font-size: 1.5rem;
          border-bottom: 1px solid var(--crepe-color-line);
          padding-bottom: 0.25em;
        }

        .milkdown-editor .ProseMirror h2 {
          font-size: 1.25rem;
        }

        .milkdown-editor .ProseMirror h3 {
          font-size: 1.1rem;
        }

        .milkdown-editor .ProseMirror ul,
        .milkdown-editor .ProseMirror ol {
          padding-left: 1.25em;
          margin: 0.35em 0;
        }

        .milkdown-editor .ProseMirror li {
          margin: 0.15em 0;
        }

        .milkdown-editor .ProseMirror li p {
          margin: 0;
        }

        .milkdown-editor .ProseMirror code {
          background: var(--crepe-color-surface);
          color: var(--crepe-color-primary);
          padding: 0.15em 0.35em;
          border-radius: 4px;
          font-family: var(--crepe-font-code);
          font-size: 0.875em;
        }

        .milkdown-editor .ProseMirror blockquote {
          border-left: 3px solid var(--crepe-color-primary);
          margin: 0.5em 0;
          padding-left: 0.75em;
          color: var(--crepe-color-muted);
        }

        .milkdown-editor .ProseMirror a {
          color: var(--crepe-color-primary);
          text-decoration: underline;
        }

        .milkdown-editor .ProseMirror hr {
          border: none;
          border-top: 1px solid var(--crepe-color-line);
          margin: 1em 0;
        }

        .milkdown-editor .ProseMirror .placeholder {
          color: var(--crepe-color-muted);
          pointer-events: none;
        }

        /* Toolbar styling */
        .milkdown-editor .crepe-toolbar {
          background: var(--crepe-color-background);
          border: 1px solid var(--crepe-color-border);
          border-radius: 6px;
          padding: 2px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .milkdown-editor .crepe-toolbar button {
          color: var(--crepe-color-solid);
        }

        .milkdown-editor .crepe-toolbar button:hover {
          background: var(--crepe-color-hover);
        }

      `}</style>
    </TooltipProvider>
  );
};

export default ProjectContextEditor;
