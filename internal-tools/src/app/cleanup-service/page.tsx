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
        err instanceof Error ? err.message : "Failed to take screenshot",
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
      </div>
    </>
  );
}
