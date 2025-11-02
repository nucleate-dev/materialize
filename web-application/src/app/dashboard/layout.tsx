"use client";

import {
  SidebarInset,
  SidebarProvider
} from "@/components/ui/sidebar";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { useAtom } from "jotai";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import MobileHeader from "../../components/dashboard/MobileHeader";
import DashboardSidebar from "../../components/dashboard/Sidebar";
import RequireAuth from "./RequireAuth";
// import WithPaywall from "./Paywall";

function DashboardContent({ children }: { children: React.ReactNode; }) {
  const [, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const pathname = usePathname();

  // Set default sidebar state for main dashboard page
  useEffect(() => {
    if (pathname === "/dashboard") {
      // This is the main dashboard page, default to open
      setSidebarOpen(true);
    }
  }, [pathname, setSidebarOpen]);

  return (
    <>
      <DashboardSidebar />
      <SidebarInset>
        {/* Sidebar Trigger - shown when sidebar is collapsed */}
        {/* {sidebarState === "collapsed" && (
          <div className="fixed top-4 left-4 z-50 hidden lg:block">
            <SidebarTrigger className="bg-background border shadow-md hover:shadow-lg" />
          </div>
        )} */}

        {/* Mobile Header (only shown on mobile) */}
        <div className="lg:hidden">
          <MobileHeader />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="h-full p-4">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode; }) {
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <RequireAuth />
      {/* <WithPaywall> */}
      <DashboardLayout>{children}</DashboardLayout>
      {/* </WithPaywall> */}
    </>
  );
}
