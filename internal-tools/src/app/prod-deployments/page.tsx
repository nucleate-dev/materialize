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
    try {
      setValidating(true);
      setDeploying(true);
      setError(null);
      setValidationResult(null);
      setDeploymentResult(null);

      const serverEndpoint = process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;
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
        "/internal/prod-deployment/validate-and-deploy",
        requestBody,
        secretKey
      );

      const response = await fetch(
        `${serverEndpoint}/internal/prod-deployment/validate-and-deploy`,
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
            `Failed to validate and deploy: ${response.status}`
        );
      }

      const result = await response.json();

      // Set both validation and deployment results from the combined response
      if (result.validationResult) {
        setValidationResult(result.validationResult);
      }
      if (result.deploymentResult) {
        setDeploymentResult(result.deploymentResult);
      }

    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate and deploy"
      );
    } finally {
      setValidating(false);
      setDeploying(false);
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

        {/* Prerequisites Information Card */}
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-800 dark:text-orange-200">
                Prerequisites
              </CardTitle>
            </div>
            <CardDescription className="text-orange-700 dark:text-orange-300">
              Before deploying to production, ensure your latest changes are
              available in the deployment artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-orange-800 dark:text-orange-200">
              <p className="font-medium mb-2">
                To deploy your latest changes to production:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>
                  Navigate to{" "}
                  <code className="bg-orange-100 dark:bg-orange-800 px-1 rounded">
                    server/control-plane
                  </code>{" "}
                  directory
                </li>
                <li>
                  Run{" "}
                  <code className="bg-orange-100 dark:bg-orange-800 px-1 rounded">
                    npm run build
                  </code>{" "}
                  to compile TypeScript
                </li>
                <li>
                  Run{" "}
                  <code className="bg-orange-100 dark:bg-orange-800 px-1 rounded">
                    npm run deploy:prod
                  </code>{" "}
                  to upload build artifacts
                </li>
                <li>Then use the validation and deployment tools below</li>
              </ol>
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-400 mt-3 p-2 bg-orange-100 dark:bg-orange-900 rounded">
              <strong>Note:</strong> The deployment validation and production
              deployment tools below will use the artifacts uploaded by{" "}
              <code>npm run deploy:prod</code>. Make sure to run this command
              after any code changes to ensure your latest updates are included
              in the deployment.
            </div>
          </CardContent>
        </Card>

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
              instances with the latest code from S3.
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
              <p>• Monitor AWS console for deployment progress</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
