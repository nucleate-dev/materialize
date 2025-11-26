"use client";

import { useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Camera,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
  X,
  Clock,
} from "lucide-react";
import {
  takePrototypeScreenshot,
  forceCleanNoBuild,
  forceCleanWithBuild,
} from "@/lib/cleanup-api";

export default function CleanupServicePage() {
  const [prototypeId, setPrototypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOperation, setLoadingOperation] = useState<
    "screenshot" | "clean-no-build" | "clean-with-build" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleTakeScreenshot = async () => {
    if (!prototypeId.trim()) {
      setError("Please enter a prototype ID");
      return;
    }

    try {
      setLoading(true);
      setLoadingOperation("screenshot");
      setError(null);
      setSuccess(null);

      const result = await takePrototypeScreenshot(prototypeId.trim());

      setSuccess(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to take screenshot",
      );
    } finally {
      setLoading(false);
      setLoadingOperation(null);
    }
  };

  const handleForceCleanNoBuild = async () => {
    if (!prototypeId.trim()) {
      setError("Please enter a prototype ID");
      return;
    }

    try {
      setLoading(true);
      setLoadingOperation("clean-no-build");
      setError(null);
      setSuccess(null);

      const result = await forceCleanNoBuild(prototypeId.trim());

      setSuccess(
        `${result.message}\nBuild ID: ${result.build_id}`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to force clean build (no wait)",
      );
    } finally {
      setLoading(false);
      setLoadingOperation(null);
    }
  };

  const handleForceCleanWithBuild = async () => {
    if (!prototypeId.trim()) {
      setError("Please enter a prototype ID");
      return;
    }

    try {
      setLoading(true);
      setLoadingOperation("clean-with-build");
      setError(null);
      setSuccess(null);

      const result = await forceCleanWithBuild(prototypeId.trim());

      setSuccess(
        `${result.message}\nBuild ID: ${result.build_id}\nAttempts: ${result.attempts}\nScreenshot Taken: ${result.screenshot_taken ? "Yes" : "No"}`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to force clean build (with retry)",
      );
    } finally {
      setLoading(false);
      setLoadingOperation(null);
    }
  };

  const handlePrototypeInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTakeScreenshot();
    }
  };

  return (
    <>
      <PageHeader
        title="Cleanup Service"
        breadcrumbs={[{ title: "Cleanup Service" }]}
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
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Screenshot Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Screenshot Testing</CardTitle>
            <CardDescription>
              Test the screenshot capability for a specific prototype. This will
              take a mobile-sized screenshot of the prototypes build and upload
              it to Supabase Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="prototypeId">Prototype ID</Label>
                <Input
                  id="prototypeId"
                  placeholder="Enter prototype ID (e.g., 12345678-1234-1234-1234-123456789abc)"
                  value={prototypeId}
                  onChange={(e) => setPrototypeId(e.target.value)}
                  onKeyPress={handlePrototypeInputKeyPress}
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleTakeScreenshot}
                  disabled={loading || !prototypeId.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Taking Screenshot...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Take Screenshot
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Force Clean - No Build Wait */}
        <Card>
          <CardHeader>
            <CardTitle>Force Clean (No Build Wait)</CardTitle>
            <CardDescription>
              Force clean a build for a specific prototype without waiting for
              successful build completion. This will immediately terminate the
              Fargate task and clean up all resources. Use this when you need to
              quickly clean up a stuck or problematic build.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="cleanNoBuildId">Prototype ID</Label>
                <Input
                  id="cleanNoBuildId"
                  placeholder="Enter prototype ID (e.g., 12345678-1234-1234-1234-123456789abc)"
                  value={prototypeId}
                  onChange={(e) => setPrototypeId(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleForceCleanNoBuild}
                  disabled={loading || !prototypeId.trim()}
                  variant="destructive"
                >
                  {loading && loadingOperation === "clean-no-build" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Force Clean (No Wait)
                    </>
                  )}
                </Button>
              </div>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> This will immediately terminate the
                build without waiting for it to complete. Use only when
                necessary.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Force Clean - With Build Wait & Retry */}
        <Card>
          <CardHeader>
            <CardTitle>Force Clean (With Build Wait & Screenshot)</CardTitle>
            <CardDescription>
              Force clean a build for a specific prototype while waiting for
              successful build completion. This uses retry logic (3 attempts, 2
              minutes apart) and automatically takes a screenshot after successful
              cleanup. Use this when you want to ensure the build completes before
              cleanup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="cleanWithBuildId">Prototype ID</Label>
                <Input
                  id="cleanWithBuildId"
                  placeholder="Enter prototype ID (e.g., 12345678-1234-1234-1234-123456789abc)"
                  value={prototypeId}
                  onChange={(e) => setPrototypeId(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleForceCleanWithBuild}
                  disabled={loading || !prototypeId.trim()}
                  variant="default"
                >
                  {loading && loadingOperation === "clean-with-build" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cleaning with Retry...
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 mr-2" />
                      Force Clean (With Retry)
                    </>
                  )}
                </Button>
              </div>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> This operation may take up to 6+ minutes
                (3 attempts × 2 minute delays) if the build is still in progress.
                A screenshot will be taken automatically on success.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
