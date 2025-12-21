"use client";

import "@xterm/xterm/css/xterm.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Rocket } from "lucide-react";

interface SandboxDeploymentCardProps {
  deploymentType: "development" | "production";
}

export function SandboxDeploymentCard({
  deploymentType,
}: SandboxDeploymentCardProps) {
  const [deploying, setDeploying] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);

  const title =
    deploymentType === "development"
      ? "Sandbox Deployment (Dev)"
      : "Sandbox Deployment to Production";

  const description =
    deploymentType === "development"
      ? "Deploy the sandbox Docker image to ECR for development testing."
      : "Deploy the sandbox Docker image to production ECR.";

  const apiEndpoint =
    deploymentType === "development"
      ? "/api/development/deploy-sandbox-for-development"
      : "/api/production/deploy-sandbox-to-prod";

  const tooltipText =
    deploymentType === "development"
      ? "Build and push the sandbox Docker image to ECR. This runs the push-to-ecr.sh script from the server directory."
      : "Build and push the sandbox Docker image to production ECR. This runs the push-to-prod-ecr.sh script from the server directory.";

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return;
    // Don't reinitialize if already initialized
    if (xtermRef.current) return;

    console.log("[SandboxDeployment] Initializing terminal");

    const initTerminal = async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      const terminal = new Terminal({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#09090b",
          foreground: "#fafafa",
        },
        convertEol: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalRef.current!);
      fitAddon.fit();

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      console.log("[SandboxDeployment] Terminal initialized successfully");
      terminal.writeln(
        "Ready to deploy sandbox. Click the deploy button to begin..."
      );

      // Handle window resize
      const handleResize = () => {
        fitAddon.fit();
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        terminal.dispose();
      };
    };

    initTerminal();
  }, []);

  const handleDeploy = useCallback(async () => {
    console.log("[SandboxDeployment] Starting deployment");
    console.log(
      "[SandboxDeployment] Terminal ref exists:",
      !!xtermRef.current
    );

    setDeploying(true);

    // Clear terminal and write header
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln(
        deploymentType === "development"
          ? "\x1b[1;36m=== Deploying Sandbox to ECR (Dev) ===\x1b[0m\n"
          : "\x1b[1;36m=== Deploying Sandbox to Production ECR ===\x1b[0m\n"
      );
    } else {
      console.warn("[SandboxDeployment] Terminal not initialized yet!");
    }

    try {
      console.log("[SandboxDeployment] Fetching", apiEndpoint);
      const response = await fetch(apiEndpoint, {
        method: "POST",
      });

      console.log("[SandboxDeployment] Response status:", response.status);
      console.log(
        "[SandboxDeployment] Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        throw new Error("Failed to start sandbox deployment");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        console.error("[SandboxDeployment] No response body available");
        throw new Error("No response body");
      }

      console.log("[SandboxDeployment] Starting to read stream");
      let buffer = "";
      let finalResult: { success: boolean; error?: string } = {
        success: false,
      };
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(
            "[SandboxDeployment] Stream done. Total chunks received:",
            chunkCount
          );
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        console.log(
          "[SandboxDeployment] Received chunk #" + chunkCount + ":",
          chunk.substring(0, 100) + "..."
        );

        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          console.log(
            "[SandboxDeployment] Processing line:",
            line.substring(0, 100) + "..."
          );

          try {
            const message = JSON.parse(line);
            console.log("[SandboxDeployment] Parsed message type:", message.type);

            if (message.type === "data") {
              // Write to terminal if available
              if (xtermRef.current) {
                xtermRef.current.write(message.data);
              }
            } else if (message.type === "done") {
              console.log("[SandboxDeployment] Received done message:", message);
              finalResult = { success: message.success };
            } else if (message.type === "error") {
              console.error(
                "[SandboxDeployment] Received error message:",
                message
              );
              finalResult = { success: false, error: message.error };
            }
          } catch (e) {
            console.error("[SandboxDeployment] Failed to parse message:", line, e);
          }
        }
      }

      console.log("[SandboxDeployment] Final result:", finalResult);

      if (!finalResult.success) {
        const error = new Error(
          finalResult.error || "Sandbox deployment failed"
        );
        throw error;
      }

      if (xtermRef.current) {
        xtermRef.current.writeln(
          "\n\x1b[1;32m✓ Sandbox deployment completed successfully!\x1b[0m"
        );
      }
    } catch (err) {
      console.error("[SandboxDeployment] Error during deployment:", err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to deploy sandbox";

      if (xtermRef.current) {
        xtermRef.current.writeln(
          `\n\x1b[1;31m✗ Error: ${errorMsg}\x1b[0m`
        );
      }
    } finally {
      console.log("[SandboxDeployment] Deployment finished");
      setDeploying(false);
    }
  }, [apiEndpoint, deploymentType]);

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[20%_80%] gap-6">
          {/* Left side: Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold">{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="flex items-center gap-2"
                  >
                    {deploying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4" />
                        Deploy Sandbox to{" "}
                        {deploymentType === "development" ? "ECR" : "Prod ECR"}
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Right side: Terminal */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Rocket className="h-4 w-4 text-muted-foreground" />
              Deployment output
            </div>
            <div className="rounded border overflow-hidden">
              <div
                ref={terminalRef}
                className="h-48"
                style={{
                  backgroundColor: "#09090b",
                }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
