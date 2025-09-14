"use client";

import { useState } from "react";
import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "@/lib/internal-tools-auth";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Server,
  Container,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";

export default function DevServerPage() {
  const [ec2ServerName, setEc2ServerName] = useState("");
  const [fargateTaskName, setFargateTaskName] = useState("");
  const [ec2Loading, setEc2Loading] = useState(false);
  const [fargateLoading, setFargateLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      const successMessage = `EC2 instance acquired successfully!

Instance Details:
• Instance ID: ${result.instanceId}
• State: ${result.state}
• Public DNS (paste into /server/scripts/deploy-control-plane-for-dev.js): ${result.publicDns}
• Public IPv4 (paste into .env for internal-tools and web-application): ${result.publicIpv4}

SSH Connection:
${result.sshCommand}

Note: It may take a few minutes for the instance to fully boot and become accessible.`;

      setSuccess(successMessage);
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

        {/* EC2 Dev Server Card */}
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
