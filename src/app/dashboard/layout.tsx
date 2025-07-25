"use client";

import "./globals.css";
import "./data-tables-css.css";
import "./satoshi.css";
import { useEffect, useState } from "react";
import Loader from "../../components/dashboard/Loader";
import Sidebar from "../../components/dashboard/Sidebar";
import Header from "../../components/dashboard/Header";
import RequireAuth from "./RequireAuth";
import { SidebarProvider } from "@/hooks/useSidebar";
// import WithPaywall from "./Paywall";

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
          <div className="dark:bg-boxdark-2 bg-gray-2 dark:text-bodydark">
            {loading ? (
              <Loader />
            ) : (
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                {/* <!-- ===== Content Area Start ===== --> */}
                <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
                  <Header />
                  <main>
                    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
                      {children}
                    </div>
                  </main>
                </div>
                {/* <!-- ===== Content Area End ===== --> */}
              </div>
            )}
          </div>
          {/* </WithPaywall> */}
        </SidebarProvider>
      </body>
    </html>
  );
}
