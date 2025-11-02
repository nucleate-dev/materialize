"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import { HorizontalModeToggle } from "@/components/prototype-editor/horizontal-mode-toggle";
import MaterializeRenderSection from "@/components/prototype-editor/MaterializeRenderSection";
import PublicPrototypeHeader from "@/components/prototype-editor/PublicPrototypeHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { EyeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import {
  FlaskConical,
  Folder,
  LogOut,
  Rocket,
  Settings,
  Sparkles,
  SquareStack,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

function AppSidebar() {
  const pathname = usePathname();

  const menuItems = [
    {
      href: "/dashboard/projects",
      icon: Rocket,
      label: "Projects",
      active: pathname?.includes("projects"),
    },
    {
      href: "/dashboard/folders",
      icon: Folder,
      label: "Folders",
      active: pathname?.includes("projects"),
    },
    ...(SHOW_WHITEBOARDS
      ? [
        {
          href: "/dashboard/whiteboards",
          icon: SquareStack,
          label: "Whiteboards",
          active: pathname?.includes("whiteboards"),
        },
      ]
      : []),
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <Link href="/" className="group">
            <div className="relative flex items-center gap-3 px-3 py-2">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <FlaskConical className="relative w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <span className="relative text-xl font-bold text-foreground transition-transform duration-300 group-hover:scale-105">
                Materialize
              </span>
            </div>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link href="/">
                    <Sparkles className="w-5 h-5" />
                    <span>New chat +</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={item.active}>
                    <Link href={item.href}>
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <HorizontalModeToggle sidebarExpanded={true} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname?.includes("account")}>
              <Link href="/dashboard/account">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("Static build");
  const [isPreviewView, setIsPreviewView] = useState(true);

  useEffect(() => {
    async function fetchPrototypeData() {
      if (!prototypeId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch prototype data
        const { data: prototypeData, error: prototypeError } = await supabase
          .from("prototypes")
          .select("*")
          .eq("id", prototypeId)
          .single();

        if (prototypeError) {
          throw prototypeError;
        }

        setPrototype(prototypeData);
        setIsLoading(false);

        // Call fetch-viewing-url API to get viewing URL
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;

          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const fetchViewResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                prototype_id: prototypeId,
                current_page: "view",
              } as FetchViewingUrlRequestBody),
            },
          );

          if (fetchViewResponse.ok) {
            const fetchViewData: APIResponse<FetchViewingUrlSuccessResponse, StandardErrorResponse> =
              await fetchViewResponse.json();
            if (fetchViewData.data) {
              setViewingUrl(fetchViewData.data.viewing_url);
            } else if (fetchViewData.error) {
              logger.debug("error", "Error in fetch-viewing-url response:", {
                ...fetchViewData.error,
              });
            }
          } else {
            logger.debug("error", "Failed to fetch viewing URL:", {
              ...fetchViewResponse,
            });
          }
        } catch (fetchViewError) {
          logger.debug("error", "Error calling fetch-viewing-url API:", {
            message:
              fetchViewError instanceof Error
                ? fetchViewError.message
                : String(fetchViewError),
            stack:
              fetchViewError instanceof Error
                ? fetchViewError.stack
                : undefined,
          });
        }
      } catch (err) {
        logger.debug("error", "Error fetching prototype data:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setError(
          err instanceof Error ? err.message : "Failed to load prototype",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrototypeData();
  }, [prototypeId, logger]);

  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
  };

  if (isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive rounded-full flex items-center justify-center mx-auto mb-4">
              <SparklesIcon className="w-8 h-8 text-destructive-foreground" />
            </div>
            <CardTitle className="text-2xl">
              Couldn&apos;t Load Prototype
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <EyeIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Prototype Not Found</CardTitle>
            <CardDescription>
              The prototype you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to view it.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <main className="flex flex-1 flex-col h-screen overflow-hidden">
        {/* Header with Sidebar Trigger */}
        <div className="flex items-center gap-4 p-4 border-b">
          <SidebarTrigger />
          <div className="flex-1">
            <PublicPrototypeHeader
              prototype={prototype}
              onUpdatePrototype={handleUpdatePrototype}
            />
          </div>
        </div>

        {/* Main Content - ExpoSnackViewer */}
        <div className="flex-1">
          <MaterializeRenderSection
            viewing_url={viewingUrl ?? ""}
            prototypeId={prototypeId}
            currentRenderStatus={renderStatus}
            onRenderStatusChange={setRenderStatus}
            isPreviewView={isPreviewView}
            onPreviewViewChange={setIsPreviewView}
            publicView={true}
            codeView={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Code view is unavailable in the public prototype viewer.
              </div>
            }
          />
        </div>
      </main>
    </SidebarProvider>
  );
}
