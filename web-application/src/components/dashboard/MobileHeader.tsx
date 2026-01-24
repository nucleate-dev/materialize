"use client";

import { HorizontalModeToggle } from "@/components/prototype-editor/horizontal-mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  SHOW_WHITEBOARDS,
  TEAM_ACCOUNT_CREDITS_SETTINGS_PATH,
} from "@/GlobalConstants";
import {
  ChevronDown,
  LogOut,
  Menu,
  MoreHorizontal,
  Rocket,
  Settings,
  Sparkles,
  SquareStack,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";

const MobileHeader = () => {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();
  const logger = useProductLogger();
  const logSidebarClick = (
    item: string,
    properties?: Record<string, unknown>,
  ) => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "MobileHeader",
        item,
        ...properties,
      },
    });
  };

  const menuItems = [
    {
      href: "/dashboard",
      icon: Sparkles,
      label: "Chat",
      active: pathname === "/dashboard",
    },
    {
      href: "/dashboard/projects",
      icon: Rocket,
      label: "Projects",
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

  // Get current active item
  const currentItem = menuItems.find((item) => item.active) || menuItems[0];

  return (
    <header className="lg:hidden z-50 w-full bg-background/80 backdrop-blur-sm border-b border-border">
      <Card className="border-0 rounded-none bg-transparent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Left: Menu Button */}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpenMobile(!openMobile)}
                aria-controls="sidebar"
                aria-expanded={openMobile}
                className="lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Navigation Dropdown */}
            <div className="flex-1 flex justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 px-4 py-2 h-auto"
                  >
                    <currentItem.icon className="w-4 h-4" />
                    <span className="font-medium">{currentItem.label}</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  {menuItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => {
                          logSidebarClick(item.label.toLowerCase(), {
                            href: item.href,
                          });
                          setOpenMobile(false);
                        }}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Right: Settings Menu */}
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link
                      href={TEAM_ACCOUNT_CREDITS_SETTINGS_PATH}
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => {
                        logSidebarClick("settings", {
                          href: TEAM_ACCOUNT_CREDITS_SETTINGS_PATH,
                        });
                        setOpenMobile(false);
                      }}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem className="flex items-center cursor-pointer p-0">
                    <HorizontalModeToggle sidebarExpanded={true} />
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => {
                      logSidebarClick("logout");
                      logout();
                    }}
                    className="flex items-center gap-3 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    </header>
  );
};

export default MobileHeader;
