"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Copy,
  Download,
  FileText,
  GitCompare,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

/**
 * Types for AI Document Generation (mirrors backend types)
 */
export type AIDocumentType = "generate-prd" | "critique-designs";

export interface AIDocumentScreen {
  path: string;
  screenshotDataUrl: string;
}

export interface AIDocument {
  title: string;
  content: string;
  generatedAt: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  costUsd?: number;
}

export interface AIDocumentResponse {
  success: boolean;
  document?: AIDocument;
  error?: string;
  creditsCharged?: number;
}

interface DocumentGenerationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: AIDocumentType | null;
  prototypeId: string;
  prototypeName?: string;
  screens: AIDocumentScreen[];
  sandboxUrl: string;
  framework?: string;
  designSystem?: string;
}

/**
 * Modal for generating and displaying AI documents (PRDs, design critiques)
 */
export function DocumentGenerationModal({
  isOpen,
  onOpenChange,
  documentType,
  prototypeId,
  prototypeName,
  screens,
  sandboxUrl,
  framework,
  designSystem,
}: DocumentGenerationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [document, setDocument] = useState<AIDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null);

  const documentTypeLabels: Record<AIDocumentType, { title: string; description: string; icon: typeof FileText }> = {
    "generate-prd": {
      title: "Generate PRD",
      description: "Creating a comprehensive Product Requirements Document from your screens...",
      icon: FileText,
    },
    "critique-designs": {
      title: "Design Critique",
      description: "Analyzing your designs and generating actionable feedback...",
      icon: GitCompare,
    },
  };

  const generateDocument = useCallback(async () => {
    if (!documentType || !sandboxUrl || screens.length === 0) {
      setError("Missing required data for document generation");
      return;
    }

    setIsLoading(true);
    setError(null);
    setDocument(null);

    try {
      const response = await fetch(`${sandboxUrl}/api/ai/document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: documentType,
          prototypeId,
          prototypeName,
          screens,
          framework,
          designSystem,
        }),
      });

      const data: AIDocumentResponse = await response.json();

      if (data.success && data.document) {
        setDocument(data.document);
        setCreditsCharged(data.creditsCharged ?? null);
        toast.success("Document generated", {
          description: `${data.creditsCharged ?? 0} credits used`,
        });
      } else {
        setError(data.error || "Failed to generate document");
        toast.error("Generation failed", {
          description: data.error,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to connect to AI service: ${errorMessage}`);
      toast.error("Connection failed", {
        description: "Could not reach the AI service",
      });
    } finally {
      setIsLoading(false);
    }
  }, [documentType, sandboxUrl, prototypeId, prototypeName, screens, framework, designSystem]);

  // Start generation when modal opens with a document type
  useEffect(() => {
    if (isOpen && documentType && !document && !isLoading && !error) {
      generateDocument();
    }
  }, [isOpen, documentType, document, isLoading, error, generateDocument]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow close animation
      const timeout = setTimeout(() => {
        setDocument(null);
        setError(null);
        setCreditsCharged(null);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const handleCopyContent = useCallback(async () => {
    if (!document) return;

    try {
      await navigator.clipboard.writeText(document.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [document]);

  const handleDownload = useCallback(() => {
    if (!document) return;

    const blob = new Blob([document.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.md`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded as Markdown");
  }, [document]);

  const currentType = documentType ? documentTypeLabels[documentType] : null;
  const IconComponent = currentType?.icon || Sparkles;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] bg-background border-border text-foreground flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <IconComponent className="w-5 h-5 text-purple-400" />
            {document?.title || currentType?.title || "AI Document"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isLoading
              ? currentType?.description
              : document
                ? `Generated on ${new Date(document.generatedAt).toLocaleString()}`
                : error
                  ? "Generation failed"
                  : "Preparing to generate..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="relative">
                <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                <Sparkles className="w-5 h-5 text-purple-300 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Analyzing {screens.length} screen{screens.length !== 1 ? "s" : ""}...
                </p>
                <p className="text-xs text-muted-foreground/70">
                  This may take a moment
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="text-center space-y-2 max-w-md">
                <p className="text-sm text-foreground font-medium">Generation Failed</p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  generateDocument();
                }}
              >
                Try Again
              </Button>
            </div>
          ) : document ? (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold text-foreground mt-6 mb-3 first:mt-0">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold text-foreground mt-5 mb-2">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-medium text-foreground mt-4 mb-2">{children}</h3>
                    ),
                    h4: ({ children }) => (
                      <h4 className="text-sm font-medium text-foreground mt-3 mb-1">{children}</h4>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-muted-foreground">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                    code: ({ children }) => (
                      <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{children}</code>
                    ),
                    pre: ({ children }) => (
                      <pre className="bg-muted p-3 rounded-md overflow-x-auto mb-3">{children}</pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-purple-400 pl-4 italic text-muted-foreground my-3">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="border-border my-4" />,
                  }}
                >
                  {document.content}
                </ReactMarkdown>
              </div>
            </ScrollArea>
          ) : null}
        </div>

        {document && (
          <div className="flex items-center justify-between pt-4 border-t border-border flex-shrink-0">
            <div className="text-xs text-muted-foreground">
              {creditsCharged !== null && (
                <span>{creditsCharged} credit{creditsCharged !== 1 ? "s" : ""} used</span>
              )}
              {document.usage && (
                <span className="ml-3">
                  {document.usage.inputTokens + document.usage.outputTokens} tokens
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyContent}
                className="h-8"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="h-8"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
