"use client";

import { Loader2, Monitor, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type ViewMode = "mobile" | "web";

interface FetchViewingUrlSuccessResponse {
  viewing_url: string;
  source: string;
  status: string | null;
}

interface FetchViewingUrlApiResponse {
  data: FetchViewingUrlSuccessResponse | null;
  error: {
    error: string;
    message: string;
  } | null;
}

export default function ViewPrototypePage() {
  const [prototypeId, setPrototypeId] = useState("");
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("web");

  const serverEndpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT ?? "";
  }, []);

  const serviceRoleKey = useMemo(() => {
    return process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? "";
  }, []);

  const handleFetchViewingUrl = async () => {
    const trimmedId = prototypeId.trim();

    if (!trimmedId) {
      setError("Please enter a prototype ID");
      return;
    }

    setLoading(true);
    setError(null);
    setViewingUrl(null);

    if (!serverEndpoint) {
      setLoading(false);
      setError(
        "Server endpoint not configured. Set NEXT_PUBLIC_INTERNAL_TOOLS_PROD_SERVER_ENDPOINT.",
      );
      return;
    }

    if (!serviceRoleKey) {
      setLoading(false);
      setError(
        "Supabase service role key not configured. Set NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.",
      );
      return;
    }

    try {
      const response = await fetch(
        `${serverEndpoint}/prototype/fetch-viewing-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            prototype_id: trimmedId,
            current_page: "edit",
          }),
        },
      );

      const payload: FetchViewingUrlApiResponse = await response.json();

      if (!response.ok || payload.error || !payload.data?.viewing_url) {
        throw new Error(
          payload.error?.message ?? "Failed to fetch viewing URL",
        );
      }

      setViewingUrl(payload.data.viewing_url);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error fetching viewing URL",
      );
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-background">
        <div className="flex h-12 items-center gap-4 px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-lg font-semibold">View Prototype</h1>
          <div className="flex-1" />

          {viewingUrl && (
            <div className="flex gap-1 rounded-md border p-1">
              <Button
                variant={viewMode === "web" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("web")}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Web
              </Button>
              <Button
                variant={viewMode === "mobile" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("mobile")}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Mobile
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {!viewingUrl ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-md space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="prototype-id"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Prototype ID
                </label>
                <div className="flex gap-2">
                  <Input
                    id="prototype-id"
                    placeholder="Enter prototype ID"
                    value={prototypeId}
                    onChange={(e) => setPrototypeId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleFetchViewingUrl();
                      }
                    }}
                    disabled={loading}
                  />
                  <Button onClick={handleFetchViewingUrl} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading
                      </>
                    ) : (
                      "Load Prototype"
                    )}
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
        ) : (
          <div className="h-full w-full">
            {viewMode === "web" ? (
              <iframe
                title="Prototype Viewer"
                src={viewingUrl}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted/30 p-6">
                <div className="relative aspect-[9/17] h-full max-h-[90vh]">
                  <div className="absolute inset-0 rounded-[2.75rem] border border-border/60 bg-background shadow-2xl">
                    <div className="absolute left-1/2 top-2 h-4 w-24 -translate-x-1/2 rounded-full bg-muted" />
                    <div className="absolute inset-[10px] rounded-[2.25rem] bg-muted/80" />
                    <div className="absolute inset-[14px] overflow-hidden rounded-[2rem] bg-black">
                      <iframe
                        title="Prototype Viewer"
                        src={viewingUrl}
                        className="h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
