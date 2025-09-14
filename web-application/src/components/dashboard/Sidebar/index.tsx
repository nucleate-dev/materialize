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
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useAtom } from "jotai";
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
import { usePathname } from "next/navigation";

const DashboardSidebar = () => {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);

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
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <Link href="/" className="group">
            <div className="relative flex items-center gap-3 px-3 py-2">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <FlaskConical className="relative w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <span className="relative text-xl font-bold text-foreground transition-transform duration-300 group-hover:scale-105">
                Materialize
              </span>
            </div>
          </Link>
          <SidebarTrigger
            className="-mr-1"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"} size="lg">
                  <Link href="/dashboard">
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
                  <SidebarMenuButton asChild isActive={item.active} size="lg">
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
            <SidebarMenuButton asChild isActive={pathname?.includes("account")} size="lg">
              <Link href="/dashboard/account">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} size="lg">
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;
