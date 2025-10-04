"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Info,
  Network,
  Server,
} from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  BuildWorkerRouteResponse,
  sendBuildWorkerRequest,
} from "@/lib/build-worker-dev-api";
import { cn } from "@/lib/utils";

type BuildWorkerRouteDefinition = {
  key: string;
  label: string;
  method: "POST" | "DELETE";
  path: string;
  description: string;
  defaultBody: string;
  bodyOptional?: boolean;
  notes?: string[];
};

const BUILD_WORKER_ROUTES: BuildWorkerRouteDefinition[] = [
  {
    key: "post-dev-server",
    label: "Start or Update Dev Server",
    method: "POST",
    path: "/dev-server",
    description:
      "Creates or updates an Expo development server with the provided files and assets.",
    defaultBody: JSON.stringify(
      {
        prototype_id: "proto_123",
        framework: "expo",
        files: [
          {
            name: "App.tsx",
            contents:
              "export default function App() {\n  return null;\n}",
          },
        ],
        assets: [],
        file_scope: "complete",
        deleted_files: [],
      },
      null,
      2
    ),
    notes: [
      "Use file_scope=\"complete\" for full uploads or \"updates\" for incremental changes.",
      "Assets should include base64 encoded contents when provided.",
    ],
  },
  {
    key: "delete-dev-server",
    label: "Stop Dev Server & Build",
    method: "DELETE",
    path: "/dev-server",
    description:
      "Stops the running development server and triggers the production build pipeline.",
    defaultBody: "",
    bodyOptional: true,
    notes: [
      "Request body is optional and can include additional build configuration if needed.",
    ],
  },
  {
    key: "restart-dev-server",
    label: "Restart Dev Server",
    method: "POST",
    path: "/dev-server/restart",
    description: "Restarts the Expo development server with the current configuration.",
    defaultBody: "",
    bodyOptional: true,
    notes: ["No body required—this uses the active server state."],
  },
  {
    key: "build-and-deploy",
    label: "Build & Deploy",
    method: "POST",
    path: "/build-and-deploy",
    description:
      "Builds the current project and uploads a production deployment to S3.",
    defaultBody: JSON.stringify(
      {
        prototype_id: "proto_123",
        framework: "expo",
      },
      null,
      2
    ),
    notes: [
      "Requires that the development server has previously been allocated and synced.",
    ],
  },
  {
    key: "run-command",
    label: "Run Command",
    method: "POST",
    path: "/run-command",
    description:
      "Executes a shell command within the worker project directory and returns the output.",
    defaultBody: JSON.stringify(
      {
        command: "ls",
        args: ["-la"],
        cwd: "/tmp/expo-dev/project",
        timeout_ms: 120000,
      },
      null,
      2
    ),
    notes: [
      "Timeout defaults to 120000ms when omitted.",
      "Include env to forward custom environment variables if needed.",
    ],
  },
  {
    key: "allocate",
    label: "Allocate Worker",
    method: "POST",
    path: "/allocate",
    description:
      "Allocates the worker to a prototype and seeds scoped AWS credentials for storage access.",
    defaultBody: JSON.stringify(
      {
        accessKeyId: "AKIA...",
        secretAccessKey: "<secret>",
        sessionToken: "<session-token>",
        prototypeId: "proto_123",
      },
      null,
      2
    ),
    notes: [
      "All credential fields are required and should come from a temporary AWS session.",
    ],
  },
];

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export default function DevServerPage() {
  const [endpointInput, setEndpointInput] = useState("");
  const [savedEndpoint, setSavedEndpoint] = useState<string | null>(null);
  const [activeRouteKey, setActiveRouteKey] = useState(
    BUILD_WORKER_ROUTES[0]?.key ?? ""
  );
  const [requestBody, setRequestBody] = useState(
    BUILD_WORKER_ROUTES[0]?.defaultBody ?? ""
  );
  const [lastResponse, setLastResponse] =
    useState<BuildWorkerRouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRoute = useMemo(() => {
    return (
      BUILD_WORKER_ROUTES.find((route) => route.key === activeRouteKey) ||
      BUILD_WORKER_ROUTES[0]
    );
  }, [activeRouteKey]);

  useEffect(() => {
    if (activeRoute) {
      setRequestBody(activeRoute.defaultBody ?? "");
      setLastResponse(null);
      setError(null);
    }
  }, [activeRoute]);

  const handleSaveEndpoint = useCallback(() => {
    setError(null);
    setLastResponse(null);

    try {
      const trimmed = endpointInput.trim();
      if (!trimmed) {
        setError("Please enter a build worker endpoint before saving.");
        return;
      }

      const url = new URL(trimmed);
      if (!["http:", "https:"].includes(url.protocol)) {
        setError("Endpoint must start with http:// or https://.");
        return;
      }

      const normalized = url.toString().replace(/\/$/, "");
      setSavedEndpoint(normalized);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to parse the endpoint URL."
      );
    }
  }, [endpointInput]);

  const handleSendRequest = useCallback(async () => {
    if (!activeRoute) {
      return;
    }

    if (!savedEndpoint) {
      setError("Save a build worker endpoint before sending a request.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let payload: unknown = undefined;
      const trimmedBody = requestBody.trim();

      if (trimmedBody) {
        try {
          payload = JSON.parse(trimmedBody);
        } catch (err) {
          throw new Error(
            err instanceof Error
              ? `Invalid JSON body: ${err.message}`
              : "Invalid JSON body."
          );
        }
      } else if (!activeRoute.bodyOptional) {
        throw new Error("This route expects a JSON body.");
      }

      const response = await sendBuildWorkerRequest({
        endpoint: savedEndpoint,
        path: activeRoute.path,
        method: activeRoute.method,
        payload,
      });

      setLastResponse(response);
    } catch (err) {
      setLastResponse(null);
      setError(
        err instanceof Error ? err.message : "Failed to run build worker request."
      );
    } finally {
      setLoading(false);
    }
  }, [activeRoute, requestBody, savedEndpoint]);

  return (
    <TooltipProvider>
      <PageHeader
        title="Build Worker Development"
        breadcrumbs={[{ title: "Build Worker Development" }]}
      />
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Provide a build worker container endpoint (for example, http://10.0.0.12).
            All requests are routed through the control plane and will be sent to port
            <span className="mx-1 font-medium">3002</span> on that host.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-orange-600" />
              <CardTitle>Build Worker Endpoint</CardTitle>
            </div>
            <CardDescription>
              Save the container endpoint you want to inspect. The saved endpoint is used for all
              build worker API requests below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="endpoint">Container endpoint</Label>
              <Input
                id="endpoint"
                placeholder="http://10.0.0.12"
                value={endpointInput}
                onChange={(event) => setEndpointInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter an IP or hostname with protocol. Port 3002 will be used automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSaveEndpoint} disabled={!endpointInput.trim()}>
                <Server className="mr-2 h-4 w-4" />
                Save endpoint
              </Button>
              {savedEndpoint && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  {savedEndpoint}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              <CardTitle>Build Worker Routes</CardTitle>
            </div>
            <CardDescription>
              Select a route from the build worker service README and provide any required payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {BUILD_WORKER_ROUTES.map((route) => (
                <Button
                  key={route.key}
                  type="button"
                  variant={route.key === activeRoute.key ? "default" : "outline"}
                  onClick={() => setActiveRouteKey(route.key)}
                  className={cn(
                    "flex items-center gap-2",
                    route.key === activeRoute.key && "shadow-sm"
                  )}
                >
                  <Badge
                    variant={route.method === "POST" ? "default" : "secondary"}
                    className="pointer-events-none"
                  >
                    {route.method}
                  </Badge>
                  <span>{route.label}</span>
                </Button>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <p className="font-medium">{activeRoute.label}</p>
                <p className="text-sm text-muted-foreground">{activeRoute.description}</p>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="uppercase tracking-wide">
                    {activeRoute.method}
                  </Badge>
                  <ArrowRight className="h-4 w-4" />
                  <code className="rounded bg-muted px-2 py-1 text-xs font-medium">
                    {activeRoute.path}
                  </code>
                </div>
              </div>

              {activeRoute.notes?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {activeRoute.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-body">Request body</Label>
              <Textarea
                id="request-body"
                value={requestBody}
                onChange={(event) => setRequestBody(event.target.value)}
                placeholder={activeRoute.bodyOptional ? "{}" : "{\n  \"prototype_id\": \"...\"\n}"}
              />
              <p className="text-xs text-muted-foreground">
                {activeRoute.bodyOptional
                  ? "Leave blank if the route does not require additional input."
                  : "Provide a JSON payload that matches the build worker route specification."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSendRequest} disabled={loading}>
                {loading ? (
                  <>
                    <Activity className="mr-2 h-4 w-4 animate-spin" />
                    Sending request...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Send request
                  </>
                )}
              </Button>
              {savedEndpoint && (
                <p className="text-xs text-muted-foreground">
                  Target URL preview: {savedEndpoint}
                  <span className="font-medium">:3002{activeRoute.path}</span>
                </p>
              )}
            </div>

            {lastResponse && (
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={lastResponse.success ? "default" : "destructive"}
                    className="uppercase"
                  >
                    {lastResponse.success ? "Success" : "Error"}
                  </Badge>
                  <span className="text-sm font-medium">
                    {lastResponse.status} {lastResponse.statusText}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lastResponse.durationMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium">Requested URL:</span>{" "}
                    <code>{lastResponse.requestedUrl}</code>
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Response headers
                  </p>
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
                    {formatJson(lastResponse.headers)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Response body
                  </p>
                  <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                    {formatJson(lastResponse.data)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
