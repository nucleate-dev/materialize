"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import { normalizePrototypeVisibility } from "@/lib/types/prototypes";
import type {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { ArrowRight, Shield, Sparkles } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

const SITE_BASE_URL =
  (process.env.NEXT_PUBLIC_SITE_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_BASE_URL ??
    "https://nucleate.dev").replace(/\/$/, "");

function MinimalHeader({
  prototype,
}: {
  prototype: Prototype;
}) {
  const visibility = normalizePrototypeVisibility(prototype.visibility);
  const visibilityLabel =
    visibility === "SELF"
      ? "Private"
      : visibility === "TEAM"
        ? "Team"
        : "Public";
  const remixUrl = `${SITE_BASE_URL}/p/${prototype.id}`;

  return (
    <div className="flex w-full items-center justify-between bg-black/60 text-white px-4 py-3 border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center text-sm font-semibold">
          {prototype.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">{prototype.name}</p>
          <p className="text-xs text-white/60 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Built with Nucleate • {visibilityLabel}
          </p>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        className="bg-white text-black hover:bg-white/90"
      >
        <Link href={remixUrl} target="_blank" rel="noreferrer">
          Remix <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
    </div>
  );
}

export default function DeployedAppPage({
  params,
}: {
  params: Promise<{ slug: string; }>;
}) {
  const { slug } = use(params);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrototype = async () => {
      setLoading(true);
      setError(null);
      const { data, error: prototypeError } = await supabase
        .from("prototypes")
        .select("*")
        .eq("slug", slug)
        .eq("is_deployed", true)
        .single();

      if (prototypeError || !data) {
        setError("App not found or not deployed.");
        setLoading(false);
        return;
      }

      const session = await supabase.auth.getSession();
      const authSession = session.data.session;
      const visibility = normalizePrototypeVisibility(data.visibility);
      if (visibility === "SELF") {
        if (!authSession) {
          setError("This app is private. Please sign in to view it.");
          setLoading(false);
          return;
        }
      }

      let resolvedViewingUrl =
        (data as Prototype & { viewing_url?: string }).viewing_url ?? "";
      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;

      if (serverEndpoint) {
        try {
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };
          if (authSession?.access_token) {
            headers.Authorization = `Bearer ${authSession.access_token}`;
          }

          const response = await fetch(
            `${serverEndpoint}/prototype/fetch-viewing-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                prototype_id: data.id,
                current_page: "view",
              } as FetchViewingUrlRequestBody),
            },
          );

          const result: APIResponse<
            FetchViewingUrlSuccessResponse,
            StandardErrorResponse
          > = await response.json();

          if (response.ok && result.data) {
            resolvedViewingUrl = result.data.viewing_url;
          }
        } catch (err) {
          console.error("Failed to fetch viewing URL for deployed app", err);
        }
      }

      setPrototype(data);
      setViewingUrl(resolvedViewingUrl);
      setLoading(false);
    };

    fetchPrototype();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 text-sm text-white/70">
          <Sparkles className="w-5 h-5 animate-pulse" />
          Loading app...
        </div>
      </div>
    );
  }

  if (error || !prototype) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="flex items-center gap-2 text-amber-200">
          <Shield className="w-5 h-5" />
          <p className="text-sm">{error ?? "Unable to load this app."}</p>
        </div>
        <Button
          asChild
          className="mt-4 bg-white text-black hover:bg-white/90"
          size="sm"
        >
          <Link href={SITE_BASE_URL}>Back to Nucleate</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <MinimalHeader prototype={prototype} />
      <div className="flex-1 min-h-0">
        {viewingUrl ? (
          <iframe
            src={viewingUrl}
            className="w-full h-full border-0"
            title={prototype.name}
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/60">
            <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
            Loading app...
          </div>
        )}
      </div>
    </div>
  );
}
