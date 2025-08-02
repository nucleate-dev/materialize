"use client";

import { SidebarProvider } from "@/hooks/useSidebar";
import { useEffect, useState } from "react";
import Loader from "../../components/dashboard/Loader";
import Sidebar from "../../components/dashboard/Sidebar";
import RequireAuth from "./RequireAuth";
// import WithPaywall from "./Paywall";

function DashboardContent({ children }: { children: React.ReactNode; }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* <!-- ===== Content Area Start ===== --> */}
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-all duration-300 ease-linear">
        {/* <Header /> */}
        <main className="flex-1 flex flex-col">
          <div className="transition-all duration-300 ease-linear max-w-none flex-1">
            {children}
          </div>
        </main>
      </div>
      {/* <!-- ===== Content Area End ===== --> */}
    </div>
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
