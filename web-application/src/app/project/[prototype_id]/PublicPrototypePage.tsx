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
import { cn } from "@/lib/classNames";
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check initial auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      active: pathname?.includes("projects"), // Kept logic as per original
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
    <Sidebar className="border-r border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#0B0C0E]">
      <SidebarHeader className="border-b border-gray-200 dark:border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <Link href="/" className="group flex-1 min-w-0">
            <div className="relative flex items-center gap-3 px-3 py-2">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <FlaskConical className="relative w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110 flex-shrink-0" />

              <span className="relative text-xl font-bold text-gray-900 dark:text-foreground transition-transform duration-300 group-hover:scale-105">
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
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  size="lg"
                  className="bg-white dark:bg-[#141517] border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-white shadow-sm transition-all"
                >
                  <Link href="/">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    <span className="font-medium">New chat +</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="px-4 py-2">
          <SidebarSeparator className="bg-gray-200 dark:bg-white/5" />
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    size="lg"
                    className={cn(
                      "text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white transition-colors",
                      item.active &&
                        "bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-medium",
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon
                        className={cn(
                          "w-5 h-5",
                          item.active ? "text-indigo-500" : "opacity-70",
                        )}
                      />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pt-4 border-t border-gray-200 dark:border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <HorizontalModeToggle sidebarExpanded={true} />
          </SidebarMenuItem>
          {isAuthenticated && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname?.includes("account")}
                  size="lg"
                  className="text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white"
                >
                  <Link href="/dashboard/account">
                    <Settings className="w-5 h-5" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={logout}
                  size="lg"
                  className="text-gray-600 dark:text-[#8A8F98] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
          {!isAuthenticated && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white"
              >
                <Link href="/login">
                  <LogOut className="w-5 h-5 rotate-180" />
                  <span>Login</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatus>("Static build");
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
            const fetchViewData: APIResponse<
              FetchViewingUrlSuccessResponse,
              StandardErrorResponse
            > = await fetchViewResponse.json();
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
        logger.debug("error", "Error fetching project data:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setError(err instanceof Error ? err.message : "Failed to load project");
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
    return (
      <div className="h-screen bg-white dark:bg-[#0B0C0E]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-[#0B0C0E] flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100 dark:border-red-500/20">
              <SparklesIcon className="w-8 h-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Couldn&apos;t Load Project
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-[#8A8F98] mt-2">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-[#0B0C0E] flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-200 dark:border-white/10">
              <EyeIcon className="w-8 h-8 text-gray-400 dark:text-[#8A8F98]" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Prototype Not Found
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-[#8A8F98] mt-2">
              The prototype you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to view it.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex w-full h-screen bg-white dark:bg-[#0B0C0E]">
        <AppSidebar />
        <main className="flex flex-1 flex-col h-screen overflow-hidden bg-white dark:bg-[#0B0C0E]">
          {/* Header with Sidebar Trigger */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
            <SidebarTrigger className="text-gray-500 dark:text-[#8A8F98] hover:bg-gray-100 dark:hover:bg-white/10" />
            <div className="flex-1">
              <PublicPrototypeHeader
                prototype={prototype}
                onUpdatePrototype={handleUpdatePrototype}
              />
            </div>
          </div>

          {/* Main Content - ExpoSnackViewer */}
          <div className="flex-1 relative">
            <MaterializeRenderSection
              viewing_url={viewingUrl ?? ""}
              prototypeId={prototypeId}
              currentRenderStatus={renderStatus}
              onRenderStatusChange={setRenderStatus}
              isPreviewView={isPreviewView}
              onPreviewViewChange={setIsPreviewView}
              publicView={true}
              codeView={
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-[#8A8F98] bg-gray-50 dark:bg-[#0B0C0E]">
                  Code view is unavailable in the public prototype viewer.
                </div>
              }
            />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
