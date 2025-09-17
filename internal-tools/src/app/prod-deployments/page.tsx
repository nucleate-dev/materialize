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
  Rocket,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface ValidationResult {
  success: boolean;
  message: string;
  instanceId?: string;
  publicIp?: string;
}

interface DeploymentResult {
  success: boolean;
  instanceRefreshId: string;
  message: string;
}

export default function ProdDeploymentsPage() {
  const [minHealthyPercentage, setMinHealthyPercentage] = useState("100");
  const [instanceWarmup, setInstanceWarmup] = useState("180");
  const [validating, setValidating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [deploymentResult, setDeploymentResult] =
    useState<DeploymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidateDeployment = async () => {
    try {
      setValidating(true);
      setError(null);
      setValidationResult(null);

      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        throw new Error(
          "Server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT environment variable."
        );
      }

      const { secretKey } = getInternalToolsConfig();
      const requestBody = JSON.stringify({});
      const headers = generateAuthHeaders(
        "POST",
        "/internal/prod-deployment/validate-deployment-safety",
        requestBody,
        secretKey
      );

      const response = await fetch(
        `${serverEndpoint}/internal/prod-deployment/validate-deployment-safety`,
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
            `Failed to validate deployment: ${response.status}`
        );
      }

      const result = await response.json();
      setValidationResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate deployment"
      );
    } finally {
      setValidating(false);
    }
  };

  const handleDeployToProd = async () => {
    try {
      setDeploying(true);
      setError(null);
      setDeploymentResult(null);

      const serverEndpoint =
        process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        throw new Error(
          "Server endpoint not configured. Please set NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT environment variable."
        );
      }

      const { secretKey } = getInternalToolsConfig();
      const requestBody = JSON.stringify({
        MinHealthyPercentage: parseInt(minHealthyPercentage),
        InstanceWarmup: parseInt(instanceWarmup),
      });
      const headers = generateAuthHeaders(
        "POST",
        "/internal/prod-deployment/deploy-to-prod",
        requestBody,
        secretKey
      );

      const response = await fetch(
        `${serverEndpoint}/internal/prod-deployment/deploy-to-prod`,
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
            `Failed to deploy to production: ${response.status}`
        );
      }

      const result = await response.json();
      setDeploymentResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to deploy to production"
      );
    } finally {
      setDeploying(false);
    }
  };

  const handleValidateAndDeploy = async () => {
    // First validate
    await handleValidateDeployment();

    // Only deploy if validation passes
    if (validationResult?.success) {
      await handleDeployToProd();
    }
  };

  return (
    <TooltipProvider>
      <PageHeader
        title="Production Deployments"
        breadcrumbs={[{ title: "Production Deployments" }]}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Validation Result Alert */}
        {validationResult && (
          <Alert
            variant={validationResult.success ? "default" : "destructive"}
            className={
              validationResult.success
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/50 dark:text-green-400"
                : ""
            }
          >
            {validationResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription>
              <div className="space-y-1">
                <p>
                  <strong>Validation Status:</strong>{" "}
                  {validationResult.success ? "PASSED" : "FAILED"}
                </p>
                <p>{validationResult.message}</p>
                {validationResult.instanceId && (
                  <p>
                    <strong>Test Instance:</strong>{" "}
                    {validationResult.instanceId}
                  </p>
                )}
                {validationResult.publicIp && (
                  <p>
                    <strong>Test IP:</strong> {validationResult.publicIp}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Deployment Result Alert */}
        {deploymentResult && (
          <Alert className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-400">
            <Rocket className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p>
                  <strong>Deployment Status:</strong>{" "}
                  {deploymentResult.success ? "INITIATED" : "FAILED"}
                </p>
                <p>{deploymentResult.message}</p>
                {deploymentResult.instanceRefreshId && (
                  <p>
                    <strong>Instance Refresh ID:</strong>{" "}
                    {deploymentResult.instanceRefreshId}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Deployment Validation Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              <CardTitle>Deployment Safety Validation</CardTitle>
            </div>
            <CardDescription>
              Validate deployment safety by spinning up a test instance with the
              production user data script. This will acquire an EC2 instance,
              run the production build process, and verify the server starts
              successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleValidateDeployment}
              disabled={validating}
              className="w-full sm:w-auto"
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Validate Deployment Safety
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                • Acquires a temporary EC2 instance with production user data
                script
              </p>
              <p>
                • Verifies the control plane server starts and responds to
                health checks
              </p>
              <p>• Instance automatically shuts down after 10 minutes</p>
              <p>• Must pass validation before production deployment</p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Production Deployment Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-blue-600" />
              <CardTitle>Production Deployment</CardTitle>
            </div>
            <CardDescription>
              Deploy the changes on the main branch to production via an Auto
              Scaling Group instance refresh. This will gradually replace
              instances with the latest code from the main branch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-healthy-percentage">
                  Min Healthy Percentage
                </Label>
                <Input
                  id="min-healthy-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={minHealthyPercentage}
                  onChange={(e) => setMinHealthyPercentage(e.target.value)}
                  disabled={deploying}
                />
                <p className="text-xs text-muted-foreground">
                  Percentage of capacity that must remain healthy during
                  deployment (default: 100)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instance-warmup">
                  Instance Warmup (seconds)
                </Label>
                <Input
                  id="instance-warmup"
                  type="number"
                  min="0"
                  value={instanceWarmup}
                  onChange={(e) => setInstanceWarmup(e.target.value)}
                  disabled={deploying}
                />
                <p className="text-xs text-muted-foreground">
                  Time to wait before moving to next instance (default: 180)
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleDeployToProd}
                disabled={deploying || !validationResult?.success}
                variant="default"
              >
                {deploying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy to Production
                  </>
                )}
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleValidateAndDeploy}
                    disabled={validating || deploying}
                    variant="secondary"
                  >
                    {validating || deploying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {validating ? "Validating..." : "Deploying..."}
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-2" />
                        Validate & Deploy
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Validates deployment safety first, then deploys if
                    validation passes
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Deployment requires successful validation first</p>
              <p>
                • Uses Auto Scaling Group instance refresh for zero-downtime
                deployment
              </p>
              <p>• Gradually replaces instances with latest main branch code</p>
              <p>• Monitor AWS console for deployment progress</p>
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
              • Always validate deployment safety before deploying to production
            </p>
            <p>
              • Validation creates a temporary test instance that automatically
              terminates
            </p>
            <p>
              • Production deployment uses Auto Scaling Group instance refresh
              for gradual rollout
            </p>
            <p>
              • Monitor CloudWatch and AWS console during deployment for any
              issues
            </p>
            <p>
              • Instance refresh can be cancelled from AWS console if needed
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
