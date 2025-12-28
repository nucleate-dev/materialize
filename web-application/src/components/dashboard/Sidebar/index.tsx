import { HorizontalModeToggle } from "@/components/prototype-editor/horizontal-mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { cn } from "@/lib/classNames";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { useAtom } from "jotai";
import {
  Atom,
  Folder,
  LogOut,
  Palette,
  Rocket,
  Sparkles,
  SquareStack,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { TeamSelector } from "./TeamSelector";
import { useFeatureFlagEnabled } from "posthog-js/react";

const DashboardSidebarContent = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { userPlan } = useSubscriptionAccess();
  const isCollapsed = state === "collapsed";
  const isPaidUser = IsUserPlanSubscribed(userPlan);
  const logger = useProductLogger();
  const isTeamsUIEnabled = useFeatureFlagEnabled("teams-ui") ?? false;

  const logSidebarItemClick = (
    item: string,
    properties?: Record<string, unknown>,
  ) => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "DashboardSidebar",
        item,
        ...properties,
      },
    });
  };

  // Handler to close mobile sidebar when a link is clicked
  const handleMobileLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

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
      active: pathname?.includes("folders"),
    },
    {
      href: "/dashboard/design-systems",
      icon: Palette,
      label: "Design Systems",
      active: pathname?.includes("design-systems"),
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
    <>
      <SidebarHeader>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Link
              href="/dashboard"
              className="p-1.5"
              onClick={handleMobileLinkClick}
            >
              <Atom className="w-5 h-5 text-primary" />
            </Link>
            <SidebarTrigger
              className="h-5 w-5"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <Link
              href="/dashboard"
              className="group flex-1 min-w-0"
              onClick={handleMobileLinkClick}
            >
              <div className="relative flex items-center gap-2">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-lg blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <Atom className="relative w-5 h-5 text-primary transition-transform duration-300 group-hover:scale-110 flex-shrink-0" />
                <span className="relative text-base font-bold text-gray-900 dark:text-foreground transition-transform duration-300 group-hover:scale-105">
                  Nucleate
                </span>
              </div>
            </Link>
            <SidebarTrigger
              className="h-5 w-5"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        )}
      </SidebarHeader>

      {/* Team Selector */}
      {isTeamsUIEnabled && (
        <div className={cn("py-1", "px-2")}>
          <TeamSelector isCollapsed={isCollapsed} />
        </div>
      )}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip={isCollapsed ? "New chat +" : undefined}
                  className={isCollapsed ? "justify-center" : ""}
                >
                  <Link
                    href="/dashboard"
                    onClick={() => {
                      logSidebarItemClick("new_chat", {
                        href: "/dashboard",
                      });
                      handleMobileLinkClick();
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    {!isCollapsed && (
                      <span className="text-sidebar-foreground">
                        New chat +
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    tooltip={isCollapsed ? item.label : undefined}
                    className={isCollapsed ? "justify-center" : ""}
                  >
                    <Link
                      href={item.href}
                      onClick={() => {
                        logSidebarItemClick(item.label.toLowerCase(), {
                          href: item.href,
                        });
                        handleMobileLinkClick();
                      }}
                    >
                      <item.icon className="w-4 h-4" />
                      {!isCollapsed && (
                        <span className="text-sidebar-foreground">
                          {item.label}
                        </span>
                      )}
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
            <HorizontalModeToggle sidebarExpanded={!isCollapsed} />
          </SidebarMenuItem>
          {!isPaidUser && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  logSidebarItemClick("upgrade_button", {
                    action: "checkout",
                    plan: "plus",
                  });
                  void handleCheckout("plus", router);
                }}
                tooltip={isCollapsed ? "Upgrade" : undefined}
                className={isCollapsed ? "justify-center" : ""}
              >
                <Zap className="w-4 h-4 text-amber-500" />
                {!isCollapsed && (
                  <span className="text-sidebar-foreground">Upgrade</span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname?.includes("account")}
              tooltip={isCollapsed ? "Account" : undefined}
              className={isCollapsed ? "justify-center" : ""}
            >
              <Link
                href="/dashboard/account"
                onClick={() => {
                  logSidebarItemClick("settings", {
                    href: "/dashboard/account",
                  });
                  handleMobileLinkClick();
                }}
              >
                <User className="w-4 h-4" />
                {!isCollapsed && (
                  <span className="text-sidebar-foreground">Account</span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                logSidebarItemClick("logout");
                logout();
              }}
              tooltip={isCollapsed ? "Logout" : undefined}
              className={isCollapsed ? "justify-center" : ""}
            >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && (
                <span className="text-sidebar-foreground">Logout</span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
};

const DashboardSidebar = () => {
  return (
    <Sidebar collapsible="icon">
      <DashboardSidebarContent />
    </Sidebar>
  );
};

export default DashboardSidebar;
