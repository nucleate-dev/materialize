import { useSidebar } from "@/hooks/useSidebar";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/classNames";
import { HorizontalModeToggle } from "@/components/horizontal-mode-toggle";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LogOut,
  Menu,
  Rocket,
  Settings,
  Sparkles,
  SquareStack,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const Sidebar = () => {
  const pathname = usePathname();
  const { sidebarOpen, sidebarExpanded, setSidebarOpen, setSidebarExpanded } =
    useSidebar();

  // Auto-collapse sidebar when on individual project page
  useEffect(() => {
    if (pathname?.match(/^\/dashboard\/projects\/[^/]+$/)) {
      setSidebarExpanded(false);
    }
  }, [pathname, setSidebarExpanded]);

  const trigger = useRef<HTMLButtonElement | null>(null);
  const sidebar = useRef<HTMLElement | null>(null);

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (
        !sidebarOpen ||
        sidebar.current?.contains(target as Node) ||
        trigger.current?.contains(target as Node)
      )
        return;
      setSidebarOpen(false);
    };
    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  });

  // close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ key }: KeyboardEvent) => {
      if (!sidebarOpen || key !== "Escape") return;
      setSidebarOpen(false);
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  });

  const menuItems = [
    {
      href: "/dashboard/projects",
      icon: Folder,
      label: "Projects",
      active: pathname?.includes("projects"),
    },
    {
      href: "/dashboard/prototypes",
      icon: Rocket,
      label: "Prototypes",
      active: pathname?.includes("prototypes"),
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
    <aside
      ref={sidebar}
      className={`absolute left-0 top-0 z-9999 flex h-screen flex-col overflow-hidden bg-background border-r border-border duration-500 ease-out lg:static lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } ${sidebarExpanded ? "w-72" : "w-20"}`}
    >
      <Card className="h-full border-0 rounded-none bg-background/80 backdrop-blur-sm">
        <CardContent className="h-full flex flex-col p-0">
          {/* Header Section */}
          <div
            className={`flex items-center gap-3 px-6 py-6 lg:py-8 ${
              sidebarExpanded ? "justify-between" : "justify-center"
            }`}
          >
            {/* Logo Section - Only when expanded */}
            {sidebarExpanded && (
              <div className="flex items-center justify-center">
                <Link href="/dashboard" className="group">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <Image
                      width={160}
                      height={40}
                      src="/images/logo/logo.svg"
                      alt="Logo"
                      className="relative transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                </Link>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex items-center gap-2">
              {/* Expand/Collapse Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className="hidden lg:flex"
                title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarExpanded ? (
                  <ChevronLeft className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </Button>

              {/* Mobile Toggle Button */}
              <Button
                ref={trigger}
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-controls="sidebar"
                aria-expanded={sidebarOpen}
                className="lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <Separator className="mx-4 lg:mx-6" />

          {/* Navigation Section */}
          <div className="flex-1 px-4 lg:px-6 pb-6 mt-6">
            {/* New Chat Button */}
            <div className="mb-8">
              <Button
                asChild
                variant={pathname === "/dashboard" ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-auto py-3",
                  !sidebarExpanded && "justify-center",
                )}
              >
                <Link href="/dashboard">
                  <Sparkles className="w-5 h-5" />
                  {sidebarExpanded && <span>New chat +</span>}
                </Link>
              </Button>
            </div>

            {/* Menu Items */}
            <nav className="space-y-2">
              {menuItems.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={item.active ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-auto py-3",
                    !sidebarExpanded && "justify-center",
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="w-5 h-5" />
                    {sidebarExpanded && <span>{item.label}</span>}
                  </Link>
                </Button>
              ))}
            </nav>
          </div>

          <Separator className="mx-4 lg:mx-6" />

          {/* Account & System Section */}
          <div className="px-4 lg:px-6 pb-6 space-y-2">
            {/* Theme Toggle */}
            <HorizontalModeToggle sidebarExpanded={sidebarExpanded} />

            {/* Account Settings */}
            <Button
              asChild
              variant={pathname?.includes("account") ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 h-auto py-3",
                !sidebarExpanded && "justify-center",
              )}
            >
              <Link href="/dashboard/account">
                <Settings className="w-5 h-5" />
                {sidebarExpanded && <span>Settings</span>}
              </Link>
            </Button>

            {/* Logout */}
            <Button
              variant="ghost"
              onClick={logout}
              className={cn(
                "w-full justify-start gap-3 h-auto py-3 text-destructive hover:text-destructive",
                !sidebarExpanded && "justify-center",
              )}
            >
              <LogOut className="w-5 h-5" />
              {sidebarExpanded && <span>Logout</span>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
};

export default Sidebar;
