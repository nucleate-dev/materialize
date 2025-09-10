"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import Loader from "../../components/dashboard/Loader";
import MobileHeader from "../../components/dashboard/MobileHeader";
import DashboardSidebar from "../../components/dashboard/Sidebar";
import RequireAuth from "./RequireAuth";
// import WithPaywall from "./Paywall";

function DashboardContent({ children }: { children: React.ReactNode; }) {
  return (
    <>
      <DashboardSidebar />
      <main className="flex flex-1 flex-col h-screen overflow-hidden">
        {/* Header with Sidebar Trigger */}
        <div className="flex items-center gap-4 p-4 border-b lg:hidden">
          <SidebarTrigger />
          <MobileHeader />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="transition-all duration-300 ease-linear max-w-none h-full">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, []);

  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <RequireAuth />
        <SidebarProvider>
          {/* <WithPaywall> */}
          {/*  adds colored background: <div className="dark:bg-boxdark-2 bg-gray-2 dark:text-bodydark"> */}
          <div>
            {loading ? (
              <Loader />
            ) : (
              <DashboardContent>{children}</DashboardContent>
            )}
          </div>
          {/* </WithPaywall> */}
        </SidebarProvider>
      </body>
    </html>
  );
}
