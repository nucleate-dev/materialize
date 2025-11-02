"use client";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { AlertCircle, Server, Terminal, Play, Loader2 } from "lucide-react";
import { useState } from "react";

interface BuildWorkerProxyResponse {
  success: boolean;
  status: number;
  statusText: string;
  requestedUrl: string;
  durationMs: number;
  headers: Record<string, string>;
  data: unknown;
}

export default function BuildWorkerDevPage() {
  const [endpoint, setEndpoint] = useState(
    process.env.NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT || "",
  );
  const [error, setError] = useState<string | null>(null);

  // Run command state
  const [command, setCommand] = useState("");
  const [commandArgs, setCommandArgs] = useState("");
  const [commandCwd, setCommandCwd] = useState("");
  const [commandTimeout, setCommandTimeout] = useState("120000");
  const [commandSessionId, setCommandSessionId] = useState("");
  const [stripAnsiOutput, setStripAnsiOutput] = useState(true);
  const [runningCommand, setRunningCommand] = useState(false);
  const [commandResponse, setCommandResponse] = useState<string>("");

  // Generic endpoint state
  const [selectedEndpoint, setSelectedEndpoint] = useState("/dev-server");
  const [selectedMethod, setSelectedMethod] = useState<
    "POST" | "DELETE" | "GET" | "PUT"
  >("POST");
  const [payloadInput, setPayloadInput] = useState("{}");
  const [executingRequest, setExecutingRequest] = useState(false);
  const [genericResponse, setGenericResponse] = useState<string>("");

  const handleRunCommand = async () => {
    if (!endpoint.trim()) {
      setError("Please specify a build worker endpoint");
      return;
    }

    if (!command.trim()) {
      setError("Please specify a command to run");
      return;
    }

    setRunningCommand(true);
    setError(null);
    setCommandResponse("");

    try {
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;

      if (!serverEndpoint) {
        throw new Error(
          "Production server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT environment variable.",
        );
      }

      const { secretKey } = getInternalToolsConfig();

      // Parse args if provided
      let args: string[] | undefined = undefined;
      if (commandArgs.trim()) {
        try {
          args = JSON.parse(commandArgs);
          if (!Array.isArray(args)) {
            throw new Error("Args must be an array");
          }
        } catch {
          args = commandArgs.split(" ").filter((arg) => arg.trim());
        }
      }

      const payload: Record<string, unknown> = {
        command: command.trim(),
      };
      if (args) {
        payload.args = args;
      }
      if (commandCwd.trim()) {
        payload.cwd = commandCwd.trim();
      }
      if (commandTimeout) {
        payload.timeout_ms = parseInt(commandTimeout, 10);
      }
      payload.strip_ansi = stripAnsiOutput;

      const requestPayload = {
        endpoint: endpoint.trim(),
        path: "/run-command",
        method: "POST" as const,
        payload,
      };

      const requestBody = JSON.stringify(requestPayload);
      const headers = generateAuthHeaders(
        "POST",
        "/internal/build-worker-dev/execute",
        requestBody,
        secretKey,
      );

      const response = await fetch(
        `${serverEndpoint}/internal/build-worker-dev/execute`,
        {
          method: "POST",
          headers,
          body: requestBody,
        },
      );

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }

      const result: BuildWorkerProxyResponse = await response.json();

      // Format response for display
      const formattedResponse = JSON.stringify(result, null, 2);
      setCommandResponse(formattedResponse);

      // Extract stdout if available
      if (
        result.data &&
        typeof result.data === "object" &&
        "stdout" in result.data
      ) {
        const stdout = (result.data as { stdout?: string }).stdout;
        if (stdout) {
          setCommandResponse(
            `Status: ${result.data && typeof result.data === "object" && "status" in result.data ? (result.data as { status?: string }).status : "unknown"}\n\nOutput:\n${stdout}\n\nFull Response:\n${formattedResponse}`,
          );
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to run command";
      setError(errorMessage);
      setCommandResponse(`Error: ${errorMessage}`);
    } finally {
      setRunningCommand(false);
    }
  };

  const handleExecuteGenericRequest = async () => {
    if (!endpoint.trim()) {
      setError("Please specify a build worker endpoint");
      return;
    }

    setExecutingRequest(true);
    setError(null);
    setGenericResponse("");

    try {
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;

      if (!serverEndpoint) {
        throw new Error(
          "Production server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT environment variable.",
        );
      }

      const { secretKey } = getInternalToolsConfig();

      // Parse payload
      let payload: unknown = undefined;
      if (payloadInput.trim() && payloadInput.trim() !== "{}") {
        try {
          payload = JSON.parse(payloadInput);
        } catch {
          throw new Error("Invalid JSON payload");
        }
      }

      const requestPayload: Record<string, unknown> = {
        endpoint: endpoint.trim(),
        path: selectedEndpoint,
        method: selectedMethod,
      };
      if (payload) {
        requestPayload.payload = payload;
      }

      const requestBody = JSON.stringify(requestPayload);
      const headers = generateAuthHeaders(
        "POST",
        "/internal/build-worker-dev/execute",
        requestBody,
        secretKey,
      );

      const response = await fetch(
        `${serverEndpoint}/internal/build-worker-dev/execute`,
        {
          method: "POST",
          headers,
          body: requestBody,
        },
      );

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }

      const result: BuildWorkerProxyResponse = await response.json();

      // Format response for display
      const formattedResponse = JSON.stringify(result, null, 2);
      setGenericResponse(formattedResponse);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to execute request";
      setError(errorMessage);
      setGenericResponse(`Error: ${errorMessage}`);
    } finally {
      setExecutingRequest(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Build Worker Dev Tools"
        breadcrumbs={[{ title: "Build Worker Dev Tools" }]}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Endpoint Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-600" />
              <CardTitle>Build Worker Endpoint</CardTitle>
            </div>
            <CardDescription>
              Specify the build worker endpoint URL. Defaults to the configured
              environment variable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint URL</Label>
              <Input
                id="endpoint"
                placeholder="http://192.168.1.100 or http://example.com"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The endpoint will be accessed at{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {endpoint || "[endpoint]"}:3002
                </code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Run Command Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-green-600" />
              <CardTitle>Run Command</CardTitle>
            </div>
            <CardDescription>
              Execute a command in the build worker container via the
              /run-command endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="command">Command *</Label>
                <Input
                  id="command"
                  placeholder="e.g., ls, npm, echo"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  disabled={runningCommand}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="commandArgs">
                  Arguments (JSON array or space-separated)
                </Label>
                <Input
                  id="commandArgs"
                  placeholder='e.g., ["-la", "/app"] or -la /app'
                  value={commandArgs}
                  onChange={(e) => setCommandArgs(e.target.value)}
                  disabled={runningCommand}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commandCwd">Working Directory</Label>
                  <Input
                    id="commandCwd"
                    placeholder="/app"
                    value={commandCwd}
                    onChange={(e) => setCommandCwd(e.target.value)}
                    disabled={runningCommand}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commandTimeout">Timeout (ms)</Label>
                  <Input
                    id="commandTimeout"
                    type="number"
                    placeholder="120000"
                    value={commandTimeout}
                    onChange={(e) => setCommandTimeout(e.target.value)}
                    disabled={runningCommand}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commandSessionId">
                  Session ID (optional)
                </Label>
                <Input
                  id="commandSessionId"
                  placeholder="Use an existing terminal session"
                  value={commandSessionId}
                  onChange={(e) => setCommandSessionId(e.target.value)}
                  disabled={runningCommand}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to create a temporary session for this command.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="stripAnsi"
                  checked={stripAnsiOutput}
                  onCheckedChange={(checked) =>
                    setStripAnsiOutput(Boolean(checked))
                  }
                  disabled={runningCommand}
                />
                <Label htmlFor="stripAnsi" className="font-normal">
                  Strip ANSI color codes and control characters from output
                </Label>
              </div>
            </div>

            <Button
              onClick={handleRunCommand}
              disabled={runningCommand || !endpoint.trim() || !command.trim()}
              className="w-full"
            >
              {runningCommand ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Command...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Command
                </>
              )}
            </Button>

            {commandResponse && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Response</Label>
                  <Badge variant="secondary">
                    {commandResponse.includes("Error:") ? "Error" : "Success"}
                  </Badge>
                </div>
                <Textarea
                  readOnly
                  value={commandResponse}
                  className="font-mono text-xs min-h-[300px]"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Generic Endpoint Interaction */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-purple-600" />
              <CardTitle>Internal Endpoints</CardTitle>
            </div>
            <CardDescription>
              Execute requests to various build worker internal endpoints.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="selectedEndpoint">Endpoint Path</Label>
                  <Select
                    value={selectedEndpoint}
                    onValueChange={setSelectedEndpoint}
                  >
                    <SelectTrigger id="selectedEndpoint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="/dev-server">
                        POST /dev-server
                      </SelectItem>
                      <SelectItem value="/dev-server-delete">
                        DELETE /dev-server
                      </SelectItem>
                      <SelectItem value="/dev-server/restart">
                        POST /dev-server/restart
                      </SelectItem>
                      <SelectItem value="/build-and-deploy">
                        POST /build-and-deploy
                      </SelectItem>
                      <SelectItem value="/allocate">POST /allocate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="selectedMethod">Method</Label>
                  <Select
                    value={selectedMethod}
                    onValueChange={(value) =>
                      setSelectedMethod(
                        value as "POST" | "DELETE" | "GET" | "PUT",
                      )
                    }
                  >
                    <SelectTrigger id="selectedMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payloadInput">Payload (JSON)</Label>
                <Textarea
                  id="payloadInput"
                  placeholder='{"prototype_id": "test-123", "framework": "expo_react_native"}'
                  value={payloadInput}
                  onChange={(e) => setPayloadInput(e.target.value)}
                  disabled={executingRequest}
                  className="font-mono text-xs min-h-[120px]"
                />
              </div>
            </div>

            <Button
              onClick={handleExecuteGenericRequest}
              disabled={executingRequest || !endpoint.trim()}
              className="w-full"
            >
              {executingRequest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute Request
                </>
              )}
            </Button>

            {genericResponse && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Response</Label>
                  <Badge variant="secondary">
                    {genericResponse.includes("Error:") ? "Error" : "Success"}
                  </Badge>
                </div>
                <Textarea
                  readOnly
                  value={genericResponse}
                  className="font-mono text-xs min-h-[300px]"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
