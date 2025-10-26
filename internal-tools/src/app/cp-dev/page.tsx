"use client";

import {
  ControlPlaneFileExplorer,
  ControlPlaneFileNode,
} from "@/components/control-plane-file-explorer";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "@/lib/internal-tools-auth";
import {
  AlertCircle,
  Check,
  CheckCircle,
  GitCommit,
  Copy,
  Loader2,
  ListTree,
  RefreshCcw,
  Rocket,
  Server,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const INSTANCE_STORAGE_KEY = "dev-ec2-instance";

interface StoredInstance {
  instanceId: string;
  state: string;
  publicDns: string;
  publicIpv4: string;
  sshCommand: string;
  createdAt: number;
  ready: boolean;
  lifespanHours: number;
  instanceType: string;
}

type InstanceStatus = "not-ready" | "ready" | "checking" | "terminated";

export default function DevServerPage() {
  const [ec2ServerName, setEc2ServerName] = useState("");
  const [instanceType, setInstanceType] = useState("t3.micro");
  const [lifespanHours, setLifespanHours] = useState("3");
  const [ec2Loading, setEc2Loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ec2Details, setEc2Details] = useState<{
    instanceId: string;
    state: string;
    publicDns?: string;
    publicIpv4?: string;
    sshCommand?: string;
  } | null>(null);
  const [instanceStatus, setInstanceStatus] =
    useState<InstanceStatus>("checking");
  const [copiedField, setCopiedField] = useState<
    null | "publicDns" | "publicIpv4" | "sshCommand"
  >(null);
  const [fileTree, setFileTree] = useState<ControlPlaneFileNode[]>([]);
  const [changedPaths, setChangedPaths] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [deployingAll, setDeployingAll] = useState(false);
  const [deployingChanged, setDeployingChanged] = useState(false);
  const [deployingSelected, setDeployingSelected] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [deployOutput, setDeployOutput] = useState("");
  const [configuringFiles, setConfiguringFiles] = useState(false);
  const [configureSuccess, setConfigureSuccess] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [autoConfigureFiles, setAutoConfigureFiles] = useState(false);

  // Load instance from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(INSTANCE_STORAGE_KEY);
    if (!stored) {
      setInstanceStatus("terminated");
      return;
    }

    try {
      const instance: StoredInstance = JSON.parse(stored);
      const ageHours = (Date.now() - instance.createdAt) / (1000 * 60 * 60);

      // Check if instance has expired based on its lifespan
      const lifespanHours = instance.lifespanHours || 3;
      if (ageHours >= lifespanHours) {
        localStorage.removeItem(INSTANCE_STORAGE_KEY);
        setInstanceStatus("terminated");
        return;
      }

      // Load instance details
      setEc2Details({
        instanceId: instance.instanceId,
        state: instance.state,
        publicDns: instance.publicDns,
        publicIpv4: instance.publicIpv4,
        sshCommand: instance.sshCommand,
      });

      setInstanceStatus(instance.ready ? "ready" : "not-ready");

      // Verify instance is still active
      checkInstanceStatus(instance.instanceId);
    } catch {
      localStorage.removeItem(INSTANCE_STORAGE_KEY);
      setInstanceStatus("terminated");
    }
  }, []);

  const saveInstanceToStorage = (instance: {
    instanceId: string;
    state: string;
    publicDns: string;
    publicIpv4: string;
    sshCommand: string;
    ready: boolean;
    lifespanHours: number;
    instanceType: string;
  }) => {
    const stored: StoredInstance = {
      ...instance,
      createdAt: Date.now(),
    };
    localStorage.setItem(INSTANCE_STORAGE_KEY, JSON.stringify(stored));
  };

  const checkInstanceStatus = async (instanceId: string) => {
    try {
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT;
      if (!serverEndpoint) return;

      const { secretKey } = getInternalToolsConfig();
      const headers = generateAuthHeaders(
        "GET",
        `/internal/dev-server/instance-status/${instanceId}`,
        "",
        secretKey,
      );

      const response = await fetch(
        `${serverEndpoint}/internal/dev-server/instance-status/${instanceId}`,
        {
          method: "GET",
          headers,
        },
      );

      if (!response.ok) {
        // Only remove from storage if instance is definitely not found (404)
        // Don't remove on server errors (500) or other temporary issues
        if (response.status === 404) {
          localStorage.removeItem(INSTANCE_STORAGE_KEY);
          setInstanceStatus("terminated");
          setEc2Details(null);
        }
        return;
      }

      const result = await response.json();

      if (result.state === "terminated" || result.state === "terminating") {
        localStorage.removeItem(INSTANCE_STORAGE_KEY);
        setInstanceStatus("terminated");
        setEc2Details(null);
      } else if (result.statusChecks === "ok") {
        setInstanceStatus("ready");
        // Update stored instance to mark as ready
        const stored = localStorage.getItem(INSTANCE_STORAGE_KEY);
        if (stored) {
          const instance: StoredInstance = JSON.parse(stored);
          instance.ready = true;
          localStorage.setItem(INSTANCE_STORAGE_KEY, JSON.stringify(instance));
        }
      } else {
        setInstanceStatus("not-ready");
      }
    } catch {
      // If we can't check, assume it's still there but checking failed
      // Don't remove from storage
    }
  };

  const handleCopy = async (
    text: string,
    field: "publicDns" | "publicIpv4" | "sshCommand",
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
      let data: {
        files?: ControlPlaneFileNode[];
        changedPaths?: string[];
        error?: string;
      } = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to load control plane files");
      }

      const files = Array.isArray(data.files) ? data.files : [];
      setFileTree(files);
      const available = new Set(flattenFileTree(files));
      const gitChangedPaths = Array.isArray(data.changedPaths)
        ? data.changedPaths.filter((path) => available.has(path))
        : [];
      setChangedPaths(gitChangedPaths);
      setSelectedPaths((prev) => prev.filter((path) => available.has(path)));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load control plane files",
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
        : [...prev, path],
    );
  }, []);

  const callDeploy = useCallback(
    async (paths: string[], onOutput: (output: string) => void) => {
      const response = await fetch("/api/control-plane", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paths.length ? { paths } : {}),
      });

      if (!response.ok) {
        throw new Error("Failed to start deploy");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      let finalResult: { success: boolean; error?: string } = {
        success: false,
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);

            if (message.type === "data") {
              onOutput(message.data);
            } else if (message.type === "done") {
              finalResult = { success: message.success };
            } else if (message.type === "error") {
              finalResult = { success: false, error: message.error };
            }
          } catch (e) {
            console.error("Failed to parse message:", line, e);
          }
        }
      }

      if (!finalResult.success) {
        const error = new Error(
          finalResult.error ||
            (paths.length
              ? "Selective deploy failed"
              : "Control plane deploy failed"),
        );
        throw error;
      }

      return finalResult;
    },
    [],
  );

  const handleDeployAll = useCallback(async () => {
    setDeployingAll(true);
    setError(null);
    setDeployOutput("");
    try {
      await callDeploy([], (data) => {
        setDeployOutput((prev) => prev + data);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run full deploy",
      );
    } finally {
      setDeployingAll(false);
    }
  }, [callDeploy]);

  const handleDeployChanged = useCallback(async () => {
    if (!changedPaths.length) {
      return;
    }

    setSelectedPaths([...changedPaths]);
    setDeployingChanged(true);
    setError(null);
    setDeployOutput("");
    try {
      await callDeploy(changedPaths, (data) => {
        setDeployOutput((prev) => prev + data);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to deploy changed files",
      );
    } finally {
      setDeployingChanged(false);
    }
  }, [callDeploy, changedPaths]);

  const handleDeploySelected = useCallback(async () => {
    if (!selectedPaths.length) {
      return;
    }

    setDeployingSelected(true);
    setError(null);
    setDeployOutput("");
    try {
      await callDeploy(selectedPaths, (data) => {
        setDeployOutput((prev) => prev + data);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run selective deploy",
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

  // Countdown timer effect
  useEffect(() => {
    const updateCountdown = () => {
      const stored = localStorage.getItem(INSTANCE_STORAGE_KEY);
      if (!stored) {
        setTimeRemaining("");
        return;
      }

      try {
        const instance: StoredInstance = JSON.parse(stored);
        const lifespanHours = instance.lifespanHours || 3;
        const expiryTime = instance.createdAt + lifespanHours * 60 * 60 * 1000;
        const remaining = expiryTime - Date.now();

        if (remaining <= 0) {
          setTimeRemaining("Expired");
          localStorage.removeItem(INSTANCE_STORAGE_KEY);
          setInstanceStatus("terminated");
          setEc2Details(null);
          return;
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } catch {
        setTimeRemaining("");
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [ec2Details]);

  const handleAutoConfigureFiles = async (publicDns?: string, publicIpv4?: string) => {
    const dns = publicDns || ec2Details?.publicDns;
    const ipv4 = publicIpv4 || ec2Details?.publicIpv4;

    if (!dns || !ipv4) {
      setError("Missing instance details for auto-configuration");
      return;
    }

    setConfiguringFiles(true);
    setError(null);
    setConfigureSuccess(false);

    try {
      const response = await fetch("/api/update-instance-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publicDns: dns,
          publicIpv4: ipv4,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update files");
      }

      setConfigureSuccess(true);
      setTimeout(() => setConfigureSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to auto-configure files"
      );
    } finally {
      setConfiguringFiles(false);
    }
  };

  const sortedSelectedPaths = useMemo(
    () => [...selectedPaths].sort((a, b) => a.localeCompare(b)),
    [selectedPaths],
  );
  const sortedChangedPaths = useMemo(
    () => [...changedPaths].sort((a, b) => a.localeCompare(b)),
    [changedPaths],
  );

  const hasSelection = selectedPaths.length > 0;
  const hasChangedFiles = changedPaths.length > 0;
  const isDeploying = deployingAll || deployingChanged || deployingSelected;

  const handleAcquireEC2 = async () => {
    if (!ec2ServerName.trim()) {
      setError("Please enter a server name for the EC2 instance");
      return;
    }

    try {
      setEc2Loading(true);
      setError(null);
      setInstanceStatus("checking");

      // Make direct API call to production control plane
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT;

      console.log("[EC2 Acquire] Server endpoint:", serverEndpoint);

      if (!serverEndpoint) {
        throw new Error(
          "Production server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT environment variable.",
        );
      }

      const { secretKey } = getInternalToolsConfig();
      const requestBody = JSON.stringify({
        serverName: ec2ServerName.trim(),
        instanceType,
        lifespanHours: parseInt(lifespanHours, 10)
      });
      const headers = generateAuthHeaders(
        "POST",
        "/internal/dev-server/acquire-ec2",
        requestBody,
        secretKey,
      );

      const url = `${serverEndpoint}/internal/dev-server/acquire-ec2`;
      console.log("[EC2 Acquire] Request URL:", url);
      console.log("[EC2 Acquire] Request headers:", headers);
      console.log("[EC2 Acquire] Request body:", requestBody);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: requestBody,
      });

      console.log("[EC2 Acquire] Response status:", response.status);
      console.log(
        "[EC2 Acquire] Response headers:",
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          console.error("[EC2 Acquire] Error response:", errorData);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          console.error("[EC2 Acquire] Failed to parse error response:", e);
        }
        throw new Error(errorMessage);
      }

      // Handle streaming response
      console.log("[EC2 Acquire] Starting to read streaming response...");
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body available for streaming");
      }

      let buffer = "";
      let messageCount = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(
            "[EC2 Acquire] Stream complete. Total messages received:",
            messageCount,
          );
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log("[EC2 Acquire] Received chunk:", chunk);

        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          console.log("[EC2 Acquire] Processing line:", line);

          try {
            const message = JSON.parse(line);
            messageCount++;
            console.log("[EC2 Acquire] Parsed message:", message);

            if (message.type === "instance-created") {
              // First step: instance created but not ready
              const instanceDetails = {
                instanceId: message.instanceId,
                state: message.state,
                publicDns: message.publicDns,
                publicIpv4: message.publicIpv4,
                sshCommand: message.sshCommand,
              };

              console.log("[EC2 Acquire] Instance created:", instanceDetails);
              setEc2Details(instanceDetails);
              setInstanceStatus("not-ready");

              // Save to localStorage
              saveInstanceToStorage({
                ...instanceDetails,
                ready: false,
                lifespanHours: parseInt(lifespanHours, 10),
                instanceType,
              });

              // Auto-configure files if checkbox is selected
              if (autoConfigureFiles && instanceDetails.publicDns && instanceDetails.publicIpv4) {
                console.log("[EC2 Acquire] Auto-configuring files...");
                handleAutoConfigureFiles(instanceDetails.publicDns, instanceDetails.publicIpv4);
              }
            } else if (message.type === "instance-ready") {
              // Second step: instance is ready
              const instanceDetails = {
                instanceId: message.instanceId,
                state: message.state,
                publicDns: message.publicDns,
                publicIpv4: message.publicIpv4,
                sshCommand: message.sshCommand,
              };

              console.log("[EC2 Acquire] Instance ready:", instanceDetails);
              setEc2Details(instanceDetails);
              setInstanceStatus("ready");

              // Update localStorage
              saveInstanceToStorage({
                ...instanceDetails,
                ready: true,
                lifespanHours: parseInt(lifespanHours, 10),
                instanceType,
              });
            } else if (message.type === "error") {
              console.error("[EC2 Acquire] Server error:", message.error);
              throw new Error(message.error);
            }
          } catch (e) {
            console.error("[EC2 Acquire] Failed to parse message:", line, e);
          }
        }
      }

      setEc2ServerName("");
    } catch (err) {
      console.error("[EC2 Acquire] Fatal error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to acquire EC2 instance";
      setError(errorMessage);
      setInstanceStatus("terminated");
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[40%_60%]">
          {/* EC2 Acquisition Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                <CardTitle>Dev EC2 Control Plane</CardTitle>
              </div>
              <CardDescription>
                Acquire a development EC2 instance for control plane testing.
                Configure the instance type and lifespan below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="ec2-server-name" className="min-w-32">Server Name</Label>
                    <Input
                      id="ec2-server-name"
                      placeholder="e.g., dev-control-plane-testing"
                      value={ec2ServerName}
                      onChange={(e) => setEc2ServerName(e.target.value)}
                      disabled={ec2Loading}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground ml-32">
                    Will be named: dev-server-{ec2ServerName || "[name]"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="instance-type" className="min-w-32">Instance Type</Label>
                  <Select value={instanceType} onValueChange={setInstanceType} disabled={ec2Loading}>
                    <SelectTrigger id="instance-type" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="t3.micro">t3.micro (2 vCPU, 1GB RAM)</SelectItem>
                      <SelectItem value="t3.medium">t3.medium (2 vCPU, 4GB RAM)</SelectItem>
                      <SelectItem value="t3.large">t3.large (2 vCPU, 8GB RAM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="lifespan" className="min-w-32">Lifespan</Label>
                  <Select value={lifespanHours} onValueChange={setLifespanHours} disabled={ec2Loading}>
                    <SelectTrigger id="lifespan" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 hours</SelectItem>
                      <SelectItem value="4">4 hours</SelectItem>
                      <SelectItem value="5">5 hours</SelectItem>
                      <SelectItem value="6">6 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="auto-configure"
                    checked={autoConfigureFiles}
                    onCheckedChange={(checked) => setAutoConfigureFiles(checked as boolean)}
                    disabled={ec2Loading}
                  />
                  <Label
                    htmlFor="auto-configure"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Auto-configure files after instance creation
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">

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
                      <p>• Instance Type: {instanceType}</p>
                      <p>• Auto-termination: {lifespanHours} hours</p>
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
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">
                    EC2 Instance Details
                  </CardTitle>
                  {ec2Details && (
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                      {ec2Details.instanceId}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {ec2Details && (
                    <Button
                      onClick={() => handleAutoConfigureFiles()}
                      disabled={configuringFiles}
                      size="sm"
                      className="bg-black text-white hover:bg-black/90 disabled:bg-black/50"
                    >
                      {configuringFiles ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Configuring...
                        </>
                      ) : configureSuccess ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Configured!
                        </>
                      ) : (
                        <>
                          <Server className="h-4 w-4 mr-2" />
                          Auto-configure files
                        </>
                      )}
                    </Button>
                  )}
                  {ec2Details && (
                    <>
                      {instanceStatus === "ready" && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 border-green-200"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      )}
                      {instanceStatus === "not-ready" && (
                        <Badge
                          variant="secondary"
                          className="bg-red-100 text-red-800 border-red-200"
                        >
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Not Ready
                        </Badge>
                      )}
                      {instanceStatus === "checking" && (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-800 border-blue-200"
                        >
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Checking...
                        </Badge>
                      )}
                      {instanceStatus === "terminated" && (
                        <Badge
                          variant="secondary"
                          className="bg-gray-100 text-gray-800 border-gray-200"
                        >
                          Terminated
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </div>
              <CardDescription>
                {ec2Details && instanceStatus === "ready"
                  ? "EC2 instance is ready! Click 'Auto-configure files' to automatically update your local configuration files."
                  : ec2Details
                  ? "EC2 instance acquired successfully! Copy the values below into the appropriate files."
                  : "Instance details will appear here after acquisition."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeRemaining && (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Time Remaining</span>
                    <span className="text-sm font-mono font-semibold">{timeRemaining}</span>
                  </div>
                </div>
              )}
              <div className="grid gap-4">
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

        <Card className="w-full">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListTree className="h-5 w-5 text-blue-600" />
                  <CardTitle>Control Plane Files & Deploy</CardTitle>
                </div>
                <CardDescription>
                  Browse files under
                  <span className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    server/control-plane
                  </span>
                  , curate a selection, and deploy updates to your dev EC2.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={!hasSelection || isDeploying}
                  className="flex items-center gap-2"
                >
                  <ListTree className="h-4 w-4" />
                  Clear selection
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshFiles}
                  disabled={filesLoading}
                  className="flex items-center gap-2"
                >
                  {filesLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4" />
                      Refresh files
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleDeployAll}
                      disabled={isDeploying}
                      className="flex items-center gap-2"
                    >
                      {deployingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deploying all
                        </>
                      ) : (
                        <>
                          <Rocket className="h-4 w-4" />
                          Deploy all
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Run the full dev control plane deploy script.
                    </p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      onClick={handleDeployChanged}
                      disabled={isDeploying || !hasChangedFiles}
                      className="flex items-center gap-2"
                    >
                      {deployingChanged ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deploying changed
                        </>
                      ) : (
                        <>
                          <GitCommit className="h-4 w-4" />
                          Deploy changed
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Deploy only files detected as git changes.
                    </p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleDeploySelected}
                      disabled={isDeploying || !hasSelection}
                      className="flex items-center gap-2"
                    >
                      {deployingSelected ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deploying selection
                        </>
                      ) : (
                        <>
                          <ListTree className="h-4 w-4" />
                          Deploy selection
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Deploy only the paths you have checked in the explorer.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GitCommit className="h-4 w-4" />
                  {hasChangedFiles
                    ? `${changedPaths.length} changed`
                    : "No git changes"}
                </span>
                <span className="flex items-center gap-1">
                  <ListTree className="h-4 w-4" />
                  {hasSelection
                    ? `${selectedPaths.length} selected`
                    : "No selection"}
                </span>
              </div>
            </div>

            <Separator />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40">
                  {filesLoading ? (
                    <div className="flex h-[420px] items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading files...
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-auto p-2">
                      <ControlPlaneFileExplorer
                        files={fileTree}
                        selectedPaths={selectedPaths}
                        onToggle={toggleSelectedPath}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: Selecting a directory adds all nested files to your
                  deploy batch.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2 rounded-md border bg-background p-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      Git tracked changes
                    </span>
                    {hasChangedFiles ? (
                      <Badge variant="secondary" className="gap-1">
                        <GitCommit className="h-3 w-3" />
                        {changedPaths.length}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Clean</Badge>
                    )}
                  </div>
                  {hasChangedFiles ? (
                    <div className="max-h-36 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono">
                      <ul className="space-y-1">
                        {sortedChangedPaths.map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No local git changes detected for server/control-plane.
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border bg-background p-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <ListTree className="h-4 w-4 text-muted-foreground" />
                      Selected paths
                    </span>
                    <Badge variant="outline">{selectedPaths.length}</Badge>
                  </div>
                  {hasSelection ? (
                    <div className="max-h-40 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono">
                      <ul className="space-y-1">
                        {sortedSelectedPaths.map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Use the explorer to choose specific files or directories
                      for a selective deploy.
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Rocket className="h-4 w-4 text-muted-foreground" />
                    Deploy output
                  </div>
                  <div className="max-h-64 overflow-auto rounded border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {deployOutput ? (
                      deployOutput
                    ) : (
                      <span className="text-muted-foreground">
                        Deployment output will appear here after running a
                        deploy.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
