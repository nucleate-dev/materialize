"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import MobileHeader from "../../components/dashboard/MobileHeader";
import DashboardSidebar from "../../components/dashboard/Sidebar";
import RequireAuth from "./RequireAuth";
// import WithPaywall from "./Paywall";

function DashboardContent({ children }: { children: React.ReactNode; }) {
  return (
    <div className="flex h-screen w-full">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header with Sidebar Trigger */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background">
          <SidebarTrigger className="-ml-1 hidden lg:flex" />
          <div className="lg:hidden flex-1">
            <MobileHeader />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full p-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <RequireAuth />
        <SidebarProvider defaultOpen={true}>
          {/* <WithPaywall> */}
          <DashboardContent>{children}</DashboardContent>
          {/* </WithPaywall> */}
        </SidebarProvider>
      </body>
    </html>
  );
}
