"use client";

import { ControlPlaneFileExplorer, ControlPlaneFileNode } from "@/components/control-plane-file-explorer";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "@/lib/internal-tools-auth";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Copy,
  Loader2,
  ListTree,
  RefreshCcw,
  Rocket,
  Server,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function DevServerPage() {
  const [ec2ServerName, setEc2ServerName] = useState("");
  const [ec2Loading, setEc2Loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ec2Details, setEc2Details] = useState<{
    instanceId: string;
    state: string;
    publicDns?: string;
    publicIpv4?: string;
    sshCommand?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<
    null | "publicDns" | "publicIpv4" | "sshCommand"
  >(null);
  const [fileTree, setFileTree] = useState<ControlPlaneFileNode[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [deployingAll, setDeployingAll] = useState(false);
  const [deployingSelected, setDeployingSelected] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [deployOutput, setDeployOutput] = useState("");

  const handleCopy = async (
    text: string,
    field: "publicDns" | "publicIpv4" | "sshCommand"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // noop
    }
  };

  const flattenFileTree = useCallback((nodes: ControlPlaneFileNode[]) => {
    const stack = [...nodes];
    const paths: string[] = [];

    while (stack.length) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      paths.push(current.path);
      if (current.children?.length) {
        stack.push(...current.children);
      }
    }

    return paths;
  }, []);

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const response = await fetch("/api/control-plane");
      let data: { files?: ControlPlaneFileNode[]; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to load control plane files"
        );
      }

      const files = Array.isArray(data.files) ? data.files : [];
      setFileTree(files);
      const available = new Set(flattenFileTree(files));
      setSelectedPaths((prev) => prev.filter((path) => available.has(path)));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load control plane files"
      );
    } finally {
      setFilesLoading(false);
    }
  }, [flattenFileTree]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const toggleSelectedPath = useCallback((path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path)
        ? prev.filter((item) => item !== path)
        : [...prev, path]
    );
  }, []);

  const callDeploy = useCallback(async (paths: string[]) => {
    const response = await fetch("/api/control-plane", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paths.length ? { paths } : {}),
    });

    let data: { success?: boolean; output?: string; error?: string } = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false) {
      const message =
        data.error ||
        (paths.length
          ? "Selective deploy failed"
          : "Control plane deploy failed");
      const error = new Error(message) as Error & { output?: string };
      if (typeof data.output === "string") {
        error.output = data.output;
      }
      throw error;
    }

    return data;
  }, []);

  const handleDeployAll = useCallback(async () => {
    setDeployingAll(true);
    setError(null);
    setDeployOutput("");
    try {
      const result = await callDeploy([]);
      setDeployOutput(
        result.output?.trim() || "Full deploy completed successfully."
      );
    } catch (err) {
      const output =
        err && typeof err === "object" && "output" in err
          ? String((err as { output?: string }).output || "")
          : "";
      if (output) {
        setDeployOutput(output);
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run full deploy"
      );
    } finally {
      setDeployingAll(false);
    }
  }, [callDeploy]);

  const handleDeploySelected = useCallback(async () => {
    if (!selectedPaths.length) {
      return;
    }

    setDeployingSelected(true);
    setError(null);
    setDeployOutput("");
    try {
      const result = await callDeploy(selectedPaths);
      setDeployOutput(
        result.output?.trim() || "Selective deploy completed successfully."
      );
    } catch (err) {
      const output =
        err && typeof err === "object" && "output" in err
          ? String((err as { output?: string }).output || "")
          : "";
      if (output) {
        setDeployOutput(output);
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run selective deploy"
      );
    } finally {
      setDeployingSelected(false);
    }
  }, [callDeploy, selectedPaths]);

  const handleRefreshFiles = useCallback(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleClearSelection = useCallback(() => {
    setSelectedPaths([]);
  }, []);

  const sortedSelectedPaths = useMemo(
    () => [...selectedPaths].sort((a, b) => a.localeCompare(b)),
    [selectedPaths]
  );

  const hasSelection = selectedPaths.length > 0;

  const handleAcquireEC2 = async () => {
    if (!ec2ServerName.trim()) {
      setError("Please enter a server name for the EC2 instance");
      return;
    }

    try {
      setEc2Loading(true);
      setError(null);

      // Make direct API call to production control plane
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        throw new Error(
          "Production server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT environment variable."
        );
      }

      const { secretKey } = getInternalToolsConfig();
      const requestBody = JSON.stringify({ serverName: ec2ServerName.trim() });
      const headers = generateAuthHeaders(
        "POST",
        "/internal/dev-server/acquire-ec2",
        requestBody,
        secretKey
      );

      const response = await fetch(
        `${serverEndpoint}/internal/dev-server/acquire-ec2`,
        {
          method: "POST",
          headers,
          body: requestBody,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to acquire EC2 instance: ${response.status}`
        );
      }

      const result = await response.json();

      setEc2Details({
        instanceId: result.instanceId,
        state: result.state,
        publicDns: result.publicDns,
        publicIpv4: result.publicIpv4,
        sshCommand: result.sshCommand,
      });
      setEc2ServerName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to acquire EC2 instance"
      );
    } finally {
      setEc2Loading(false);
    }
  };

  return (
    <TooltipProvider>
      <PageHeader
        title="Dev Server Management"
        breadcrumbs={[{ title: "Dev Server Management" }]}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* EC2 Dev Server Section */}
        <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-6">
          {/* EC2 Acquisition Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                <CardTitle>Dev EC2 Control Plane</CardTitle>
              </div>
              <CardDescription>
                Acquire a development EC2 instance for control plane testing.
                The instance will automatically terminate after 3 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ec2-server-name">Server Name</Label>
                <p className="text-sm text-muted-foreground">
                  This will be used as part of the instance name: dev-server-
                  {ec2ServerName || "[name]"}
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  id="ec2-server-name"
                  placeholder="e.g., dev-control-plane-testing"
                  value={ec2ServerName}
                  onChange={(e) => setEc2ServerName(e.target.value)}
                  disabled={ec2Loading}
                  className="flex-1"
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleAcquireEC2}
                      disabled={ec2Loading || !ec2ServerName.trim()}
                    >
                      {ec2Loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Acquiring...
                        </>
                      ) : (
                        <>
                          <Server className="h-4 w-4 mr-2" />
                          Acquire Dev EC2
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p>• Instance Type: t3.micro</p>
                      <p>• Auto-termination: 3 hours</p>
                      <p>• Purpose: Control plane development</p>
                      <p>• Source: Production control plane</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* EC2 Instance Details Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  EC2 Instance Details
                </CardTitle>
                {ec2Details && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 border-green-200"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                )}
              </div>
              <CardDescription>
                {ec2Details
                  ? "EC2 instance acquired successfully! Copy the values below into the appropriate files."
                  : "Instance details will appear here after acquisition."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="min-w-32">Instance ID</Label>
                    <Input
                      readOnly
                      value={ec2Details?.instanceId || ""}
                      placeholder={!ec2Details ? "Not available" : ""}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="min-w-32">Public DNS</Label>
                    <Input
                      readOnly
                      value={ec2Details?.publicDns || ""}
                      placeholder={!ec2Details ? "Not available" : ""}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        ec2Details?.publicDns &&
                        handleCopy(ec2Details.publicDns, "publicDns")
                      }
                      disabled={!ec2Details?.publicDns}
                      aria-label="Copy Public DNS"
                    >
                      {copiedField === "publicDns" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {ec2Details && (
                    <p className="text-xs text-muted-foreground ml-32">
                      Paste into{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">
                        /server/scripts/deploy-control-plane-for-dev.js
                      </code>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="min-w-32">Public IPv4</Label>
                    <Input
                      readOnly
                      value={ec2Details?.publicIpv4 || ""}
                      placeholder={!ec2Details ? "Not available" : ""}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        ec2Details?.publicIpv4 &&
                        handleCopy(ec2Details.publicIpv4, "publicIpv4")
                      }
                      disabled={!ec2Details?.publicIpv4}
                      aria-label="Copy Public IPv4"
                    >
                      {copiedField === "publicIpv4" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {ec2Details && (
                    <p className="text-xs text-muted-foreground ml-32">
                      Paste into{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">.env</code>{" "}
                      files for internal-tools and web-application
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="min-w-32">SSH Command</Label>
                    <Input
                      readOnly
                      value={ec2Details?.sshCommand || ""}
                      placeholder={!ec2Details ? "Not available" : ""}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        ec2Details?.sshCommand &&
                        handleCopy(ec2Details.sshCommand, "sshCommand")
                      }
                      disabled={!ec2Details?.sshCommand}
                      aria-label="Copy SSH Command"
                    >
                      {copiedField === "sshCommand" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {ec2Details && (
                    <p className="text-xs text-muted-foreground ml-32">
                      Use this command to connect directly to the instance
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[35%_65%] gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-purple-600" />
                <CardTitle>Control Plane Deployment</CardTitle>
              </div>
              <CardDescription>
                Deploy the dev control plane to your EC2 instance directly from
                this dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDeployAll} disabled={deployingAll}>
                  {deployingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Rocket className="mr-2 h-4 w-4" />
                      Deploy All Files
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDeploySelected}
                  disabled={!hasSelection || deployingSelected}
                >
                  {deployingSelected ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying selected...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Deploy Selected
                    </>
                  )}
                  {hasSelection ? (
                    <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                      {selectedPaths.length}
                    </span>
                  ) : null}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshFiles}
                  disabled={filesLoading}
                  aria-label="Refresh control plane files"
                >
                  {filesLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={!hasSelection}
                >
                  Clear Selection
                </Button>
              </div>

              {hasSelection ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Selected paths ({selectedPaths.length})</span>
                    <Badge variant="outline">Selective deploy</Badge>
                  </div>
                  <div className="max-h-40 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono">
                    <ul className="space-y-1">
                      {sortedSelectedPaths.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select files or directories from the explorer to deploy only
                  what you need.
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>Deploy output</span>
                  <Badge variant="secondary">deploy-control-plane-for-dev.js</Badge>
                </div>
                <div className="max-h-64 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                  {deployOutput ? (
                    deployOutput
                  ) : (
                    <span className="text-muted-foreground">
                      Deployment output will appear here after running a deploy.
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ListTree className="h-5 w-5 text-blue-600" />
                <CardTitle>Control Plane Files</CardTitle>
              </div>
              <CardDescription>
                Browse files under
                <span className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  server/control-plane
                </span>
                and select them for selective deploys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading files...
                </div>
              ) : (
                <ControlPlaneFileExplorer
                  files={fileTree}
                  selectedPaths={selectedPaths}
                  onToggle={toggleSelectedPath}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
