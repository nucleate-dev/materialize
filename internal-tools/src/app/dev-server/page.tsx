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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  Container,
  Copy,
  Loader2,
  Server,
} from "lucide-react";
import { useState } from "react";

export default function DevServerPage() {
  const [ec2ServerName, setEc2ServerName] = useState("");
  const [fargateTaskName, setFargateTaskName] = useState("");
  const [ec2Loading, setEc2Loading] = useState(false);
  const [fargateLoading, setFargateLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ec2Details, setEc2Details] = useState<
    | {
      instanceId: string;
      state: string;
      publicDns?: string;
      publicIpv4?: string;
      sshCommand?: string;
    }
    | null
  >(null);
  const [copiedField, setCopiedField] = useState<
    null | "publicDns" | "publicIpv4" | "sshCommand"
  >(null);

  const handleCopy = async (text: string, field: "publicDns" | "publicIpv4" | "sshCommand") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch (_) {
      // noop
    }
  };

  const handleAcquireEC2 = async () => {
    if (!ec2ServerName.trim()) {
      setError("Please enter a server name for the EC2 instance");
      return;
    }

    try {
      setEc2Loading(true);
      setError(null);
      setSuccess(null);

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

  const handleAcquireFargate = async () => {
    if (!fargateTaskName.trim()) {
      setError("Please enter a task name for the Fargate task");
      return;
    }

    try {
      setFargateLoading(true);
      setError(null);
      setSuccess(null);

      // Make direct API call to production control plane
      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        throw new Error(
          "Production server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT environment variable."
        );
      }

      const { secretKey } = getInternalToolsConfig();
      const requestBody = JSON.stringify({ taskName: fargateTaskName.trim() });
      const headers = generateAuthHeaders(
        "POST",
        "/internal/dev-server/acquire-fargate",
        requestBody,
        secretKey
      );

      const response = await fetch(
        `${serverEndpoint}/internal/dev-server/acquire-fargate`,
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
          `Failed to acquire Fargate task: ${response.status}`
        );
      }

      const result = await response.json();
      setSuccess(
        `Fargate task acquired successfully! Task ARN: ${result.taskArn}, State: ${result.state}`
      );
      setFargateTaskName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to acquire Fargate task"
      );
    } finally {
      setFargateLoading(false);
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

        {/* Success Alert */}
        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/50 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-line">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* EC2 Dev Server Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* EC2 Acquisition Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                <CardTitle>Dev EC2 Control Plane</CardTitle>
              </div>
              <CardDescription>
                Acquire a development EC2 instance for control plane testing. The
                instance will automatically terminate after 3 hours.
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
                <CardTitle className="text-base">EC2 Instance Details</CardTitle>
                {ec2Details && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                )}
              </div>
              <CardDescription>
                {ec2Details
                  ? "EC2 instance acquired successfully! Copy the values below into the appropriate files."
                  : "Instance details will appear here after acquisition."
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ec2Details && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <h4 className="font-medium text-blue-900 mb-2">Usage Instructions:</h4>
                  <ul className="space-y-1 text-blue-800">
                    <li>• Paste <strong>Public DNS</strong> into <code>/server/scripts/deploy-control-plane-for-dev.js</code></li>
                    <li>• Paste <strong>Public IPv4</strong> into <code>.env</code> files for internal-tools and web-application</li>
                    <li>• Use <strong>SSH Command</strong> to connect to the instance directly</li>
                  </ul>
                </div>
              )}

              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Label className="min-w-32">Instance ID</Label>
                  <Input
                    readOnly
                    value={ec2Details?.instanceId || ""}
                    placeholder={!ec2Details ? "Not available" : ""}
                    className="flex-1"
                  />
                </div>

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
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Fargate Dev Task Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Container className="h-5 w-5 text-orange-600" />
              <CardTitle>Dev Fargate Build Worker</CardTitle>
            </div>
            <CardDescription>
              Acquire a development Fargate task for build worker testing. The
              task will run until manually stopped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fargate-task-name">Task Name</Label>
              <Input
                id="fargate-task-name"
                placeholder="e.g., dev-build-worker-testing"
                value={fargateTaskName}
                onChange={(e) => setFargateTaskName(e.target.value)}
                disabled={fargateLoading}
              />
              <p className="text-sm text-muted-foreground">
                This will be used as part of the task name for identification
              </p>
            </div>

            <Button
              onClick={handleAcquireFargate}
              disabled={fargateLoading || !fargateTaskName.trim()}
              className="w-full sm:w-auto"
            >
              {fargateLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Acquiring Fargate...
                </>
              ) : (
                <>
                  <Container className="h-4 w-4 mr-2" />
                  Acquire Dev Fargate Task
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Task Definition: Build worker container</p>
              <p>• Auto-termination: Manual stop required</p>
              <p>• Purpose: Build worker development</p>
            </div>
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Important Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • EC2 instances will automatically terminate after 3 hours to
              prevent unnecessary costs
            </p>
            <p>
              • Fargate tasks need to be manually stopped when no longer needed
            </p>
            <p>
              • Both resources are intended for development and testing purposes
              only
            </p>
            <p>
              • Ensure you have the necessary AWS permissions to create these
              resources
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
