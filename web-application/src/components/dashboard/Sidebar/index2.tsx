"use client";

import { HorizontalModeToggle } from "@/components/prototype-editor/horizontal-mode-toggle";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { cn } from "@/lib/classNames";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useAtom } from "jotai";
import {
  Atom,
  Folder,
  LogOut,
  Palette,
  Plus,
  Rocket,
  Settings,
  SquareStack,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const DashboardSidebarContent = () => {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

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
    <div className="flex flex-col h-full bg-white dark:bg-[#0B0C0E] text-gray-600 dark:text-[#8A8F98]">
      {/* --- Header --- */}
      <SidebarHeader className="h-14 border-b border-gray-200 dark:border-white/5 flex items-center justify-center px-4 bg-white dark:bg-[#0B0C0E]">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center justify-center"
            >
              <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                <Atom className="w-5 h-5" />
              </div>
            </Link>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-gray-200 to-gray-100 dark:from-white/10 dark:to-white/5 border border-gray-200 dark:border-white/10 group-hover:border-gray-300 dark:group-hover:border-white/20 transition-all">
                <Atom className="w-4 h-4 text-gray-900 dark:text-white" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white tracking-tight text-[15px]">
                Nucleate
              </span>
            </Link>
            <SidebarTrigger
              className="text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 w-8 h-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        )}
      </SidebarHeader>

      {/* --- Main Content --- */}
      <SidebarContent className="bg-white dark:bg-[#0B0C0E] px-2 py-4">
        {/* Primary Action: New Chat */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip={isCollapsed ? "New chat" : undefined}
                  className={cn(
                    "transition-all duration-200 border border-transparent",
                    // Active/Main State
                    !isCollapsed
                      ? "bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 shadow-[0_0_15px_-3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_-3px_rgba(255,255,255,0.2)] justify-start px-3 py-5"
                      : "bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-white/20 justify-center aspect-square",
                  )}
                >
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 font-semibold"
                  >
                    <Plus
                      className={cn(
                        "w-4 h-4",
                        !isCollapsed
                          ? "text-white dark:text-black"
                          : "text-gray-900 dark:text-white",
                      )}
                    />
                    {!isCollapsed && <span>New Chat</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Navigation Links */}
        <SidebarGroup className="p-0 mt-4">
          {/* Optional Label for Expanded State */}
          {!isCollapsed && (
            <div className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-[#8A8F98]/50">
              Projects
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    tooltip={isCollapsed ? item.label : undefined}
                    className={cn(
                      "h-9 transition-all duration-200 font-medium text-sm",
                      isCollapsed ? "justify-center" : "px-3",
                      item.active
                        ? "bg-gray-100 dark:bg-[#1A1B1E] text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-white/5"
                        : "text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5",
                    )}
                  >
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon
                        className={cn(
                          "w-4 h-4",
                          item.active
                            ? "text-indigo-600 dark:text-purple-400"
                            : "text-current opacity-70",
                        )}
                      />
                      {!isCollapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* --- Footer --- */}
      <SidebarFooter className="bg-white dark:bg-[#0B0C0E] border-t border-gray-200 dark:border-white/5 p-2">
        <SidebarMenu className="gap-1">
          {/* Mode Toggle */}
          <SidebarMenuItem>
            <div
              className={cn(
                "flex items-center",
                isCollapsed ? "justify-center" : "px-2",
              )}
            >
              <HorizontalModeToggle sidebarExpanded={!isCollapsed} />
            </div>
          </SidebarMenuItem>

          {/* Settings */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname?.includes("account")}
              tooltip={isCollapsed ? "Settings" : undefined}
              className={cn(
                "h-9 text-gray-600 dark:text-[#8A8F98] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5",
                isCollapsed ? "justify-center" : "px-3",
              )}
            >
              <Link
                href="/dashboard/account"
                className="flex items-center gap-3"
              >
                <Settings className="w-4 h-4 opacity-70" />
                {!isCollapsed && <span>Settings</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Logout */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              tooltip={isCollapsed ? "Logout" : undefined}
              className={cn(
                "h-9 text-gray-600 dark:text-[#8A8F98] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors",
                isCollapsed ? "justify-center" : "px-3",
              )}
            >
              <LogOut className="w-4 h-4 opacity-70" />
              {!isCollapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </div>
  );
};

const DashboardSidebar = () => {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#0B0C0E]"
    >
      <DashboardSidebarContent />
    </Sidebar>
  );
};

export default DashboardSidebar;
