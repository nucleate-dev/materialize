"use client";

import { useMemo, useState } from "react";
import { Plus, Loader2, RefreshCcw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ViewingCellState {
  id: string;
  prototypeId: string;
  viewingUrl: string | null;
  loading: boolean;
  error: string | null;
}

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

function createViewingCellState(): ViewingCellState {
  return {
    id: crypto.randomUUID(),
    prototypeId: "",
    viewingUrl: null,
    loading: false,
    error: null,
  };
}

export default function LiveViewerPage() {
  const [cells, setCells] = useState<ViewingCellState[]>(() => [
    createViewingCellState(),
  ]);

  const serverEndpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT ?? ""
    );
  }, []);

  const serviceRoleKey = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? ""
    );
  }, []);

  const handlePrototypeIdChange = (id: string, value: string) => {
    setCells((prev) =>
      prev.map((cell) =>
        cell.id === id
          ? {
              ...cell,
              prototypeId: value,
              error: null,
            }
          : cell,
      ),
    );
  };

  const handleAddCell = () => {
    setCells((prev) => [...prev, createViewingCellState()]);
  };

  const handleFetchViewingUrl = async (cellId: string) => {
    const existingCell = cells.find((c) => c.id === cellId);
    if (!existingCell) {
      return;
    }
    const prototypeId = existingCell?.prototypeId.trim();

    if (!prototypeId) {
      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId
            ? {
                ...item,
                loading: false,
                error: "Please enter a prototype ID",
              }
            : item,
        ),
      );
      return;
    }

    setCells((prev) =>
      prev.map((cell) =>
        cell.id === cellId
          ? { ...cell, loading: true, error: null, viewingUrl: null }
          : cell,
      ),
    );

    if (!serverEndpoint) {
      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId
            ? {
                ...item,
                loading: false,
                error:
                  "Server endpoint not configured. Set NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT.",
              }
            : item,
        ),
      );
      return;
    }

    if (!serviceRoleKey) {
      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId
            ? {
                ...item,
                loading: false,
                error:
                  "Supabase service role key not configured. Set NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.",
              }
            : item,
        ),
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
            prototype_id: prototypeId,
            current_page: "view",
          }),
        },
      );

      const payload: FetchViewingUrlApiResponse = await response.json();

      if (!response.ok || payload.error || !payload.data?.viewing_url) {
        throw new Error(
          payload.error?.message ?? "Failed to fetch viewing URL",
        );
      }

      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId
            ? {
                ...item,
                loading: false,
                viewingUrl: payload.data?.viewing_url ?? null,
              }
            : item,
        ),
      );
    } catch (error) {
      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId
            ? {
                ...item,
                loading: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error fetching viewing URL",
              }
            : item,
        ),
      );
    }
  };

  const handleResetViewingCell = (cellId: string) => {
    setCells((prev) =>
      prev.map((item) =>
        item.id === cellId
          ? {
              ...item,
              viewingUrl: null,
              error: null,
            }
          : item,
      ),
    );
  };

  return (
    <>
      <PageHeader
        title="Live Viewer"
        breadcrumbs={[{ title: "Live Viewer" }]}
      >
        <Button variant="outline" size="sm" onClick={handleAddCell}>
          <Plus className="mr-2 h-4 w-4" />
          Add Viewer
        </Button>
      </PageHeader>

      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cells.map((cell) => (
            <Card key={cell.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>Viewing Cell</CardTitle>
                <CardDescription>
                  Enter a prototype ID to load its live viewer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`prototype-${cell.id}`}>Prototype ID</Label>
                  <Input
                    id={`prototype-${cell.id}`}
                    placeholder="e.g. demo-prototype"
                    value={cell.prototypeId}
                    onChange={(event) =>
                      handlePrototypeIdChange(cell.id, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleFetchViewingUrl(cell.id);
                      }
                    }}
                    disabled={cell.loading}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => handleFetchViewingUrl(cell.id)}
                    disabled={cell.loading}
                  >
                    {cell.loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading
                      </>
                    ) : (
                      "Fetch Viewer"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleResetViewingCell(cell.id)}
                    disabled={cell.loading}
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </div>

                {cell.error && (
                  <p className="text-sm text-destructive">{cell.error}</p>
                )}

                <IPhoneFrame viewingUrl={cell.viewingUrl} loading={cell.loading} />
              </CardContent>
              <CardFooter>
                <p className="text-xs text-muted-foreground">
                  Viewing cells use the Supabase service key to load the current
                  viewing URL directly from the server endpoint.
                </p>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

interface IPhoneFrameProps {
  viewingUrl: string | null;
  loading: boolean;
}

function IPhoneFrame({ viewingUrl, loading }: IPhoneFrameProps) {
  return (
    <div className="relative mx-auto flex w-full max-w-[260px] justify-center">
      <div className="relative aspect-[9/19.5] w-full">
        <div className="absolute inset-0 rounded-[2.75rem] border border-border/60 bg-background shadow-lg">
          <div className="absolute left-1/2 top-2 h-4 w-24 -translate-x-1/2 rounded-full bg-muted" />
          <div className="absolute inset-[10px] rounded-[2.25rem] bg-muted/80" />
          <div className="absolute inset-[14px] overflow-hidden rounded-[2rem] bg-black">
            {viewingUrl ? (
              <iframe
                title="Prototype Viewer"
                src={viewingUrl}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/30 text-center text-sm text-muted-foreground">
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading viewer…
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Enter a prototype ID to load the viewer.
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
