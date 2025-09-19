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
} from "lucide-react";
import { takePrototypeScreenshot } from "@/lib/cleanup-api";

export default function CleanupServicePage() {
  const [prototypeId, setPrototypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleTakeScreenshot = async () => {
    if (!prototypeId.trim()) {
      setError("Please enter a prototype ID");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const result = await takePrototypeScreenshot(prototypeId.trim());

      setSuccess(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to take screenshot"
      );
    } finally {
      setLoading(false);
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

        {/* Service Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Service Status
              </CardTitle>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Active</div>
              <p className="text-xs text-muted-foreground">
                Cleanup service is running
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Cleanup Interval
              </CardTitle>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">5 min</div>
              <p className="text-xs text-muted-foreground">
                Hot reload cleanup interval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Screenshot Feature
              </CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Available</div>
              <p className="text-xs text-muted-foreground">
                Takes mobile screenshots
              </p>
            </CardContent>
          </Card>
        </div>

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

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium text-sm">How it works:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>
                  • Generates a signed URL for the S3 build at `{prototypeId}
                  /latest/index.html`
                </li>
                <li>
                  • Uses Puppeteer to take a mobile-sized screenshot (375x667px)
                </li>
                <li>
                  • Uploads the screenshot to Supabase Storage bucket
                  `prototype-thumbnails`
                </li>
                <li>
                  • Screenshot is saved as `{prototypeId}.png` with no
                  versioning
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Service Information */}
        <Card>
          <CardHeader>
            <CardTitle>Service Information</CardTitle>
            <CardDescription>
              Details about the cleanup service functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Cleanup Operations</h4>
              <p className="text-sm text-muted-foreground">
                The cleanup service runs every 5 minutes to identify and clean
                up idle builds. When builds are cleaned up, it automatically
                takes screenshots of the final build state before termination.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">Screenshot Process</h4>
              <p className="text-sm text-muted-foreground">
                Screenshots are taken using a headless browser with mobile
                viewport settings. The process generates signed URLs for private
                S3 objects and captures the final state of React Native Web
                applications before cleanup.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">Storage</h4>
              <p className="text-sm text-muted-foreground">
                Screenshots are stored in the `prototype-thumbnails` Supabase
                Storage bucket. Files are named using the prototype ID with
                `.png` extension and will overwrite existing screenshots for the
                same prototype.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
