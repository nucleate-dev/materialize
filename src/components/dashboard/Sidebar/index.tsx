import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSidebar } from "@/hooks/useSidebar";
import {
  SparklesIcon,
  RocketLaunchIcon,
  Square3Stack3DIcon,
  UserIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";

const Sidebar = () => {
  const pathname = usePathname();
  const { sidebarOpen, sidebarExpanded, setSidebarOpen, setSidebarExpanded } =
    useSidebar();

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
      icon: RocketLaunchIcon,
      label: "Projects",
      active: pathname?.includes("projects"),
    },
    {
      href: "/dashboard/whiteboards",
      icon: Square3Stack3DIcon,
      label: "Whiteboards",
      active: pathname?.includes("whiteboards"),
    },
    {
      href: "/dashboard/account",
      icon: UserIcon,
      label: "Account",
      active: pathname?.includes("account"),
    },
  ];

  return (
    <aside
      ref={sidebar}
      className={`absolute left-0 top-0 z-9999 flex h-screen flex-col overflow-hidden duration-500 ease-out lg:static lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } ${sidebarExpanded ? "w-72" : "w-20"}`}
    >
      {/* Enhanced Glassmorphism Background with Borders & Shadows */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 via-gray-2/85 to-whiter/90 dark:from-boxdark/90 dark:via-boxdark-2/85 dark:to-meta-4/90 backdrop-blur-xl"></div>

      {/* Multi-layered Border System */}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-stroke/60 to-transparent dark:via-strokedark/60"></div>
      <div className="absolute top-0 right-0 bottom-0 w-[2px] bg-gradient-to-b from-primary/20 via-secondary/30 to-meta-5/20 dark:from-primary/30 dark:via-secondary/40 dark:to-meta-5/30 blur-sm"></div>

      {/* Premium Shadow System */}
      <div className="absolute -right-8 top-0 bottom-0 w-8 bg-gradient-to-r from-black/5 to-transparent dark:from-black/20 dark:to-transparent pointer-events-none"></div>
      <div className="absolute -right-12 top-0 bottom-0 w-12 bg-gradient-to-r from-primary/5 via-secondary/3 to-transparent dark:from-primary/10 dark:via-secondary/6 dark:to-transparent blur-xl pointer-events-none"></div>

      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-20 -right-20 w-32 h-32 bg-gradient-to-tr from-meta-5/10 to-meta-3/10 dark:from-meta-5/20 dark:to-meta-3/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-r from-primary/5 via-secondary/5 to-meta-5/5 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10 rounded-full blur-2xl animate-spin"
          style={{ animationDuration: "20s" }}
        ></div>
      </div>

      {/* Sidebar Content */}
      <div className="relative z-10 h-full flex flex-col">
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
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="hidden lg:flex items-center justify-center w-10 h-10 rounded-xl bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110 group"
              title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              {sidebarExpanded ? (
                <ChevronLeftIcon className="relative w-5 h-5 text-body dark:text-bodydark transition-colors duration-300 group-hover:text-primary dark:group-hover:text-secondary" />
              ) : (
                <ChevronRightIcon className="relative w-5 h-5 text-body dark:text-bodydark transition-colors duration-300 group-hover:text-primary dark:group-hover:text-secondary" />
              )}
            </button>

            {/* Mobile Toggle Button */}
            <button
              ref={trigger}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <Bars3Icon className="relative w-5 h-5 text-body dark:text-bodydark transition-colors duration-300 group-hover:text-primary dark:group-hover:text-secondary" />
            </button>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 px-4 lg:px-6 pb-6 mt-4">
          {/* New Chat Button */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className={`group relative flex items-center gap-4 rounded-2xl py-4 px-4 font-semibold transition-all duration-500 transform-gpu ${
                sidebarExpanded ? "" : "justify-center"
              } ${
                pathname === "/dashboard"
                  ? "bg-gradient-to-r from-primary via-secondary to-meta-5 text-white shadow-2xl shadow-primary/40 hover:shadow-primary/60 dark:shadow-primary/60 dark:hover:shadow-primary/80 scale-100 hover:scale-105 ring-2 ring-white/30 dark:ring-primary/30"
                  : "bg-white/40 dark:bg-boxdark/40 text-body dark:text-bodydark hover:bg-white/60 dark:hover:bg-boxdark/60 border border-stroke/30 dark:border-strokedark/40 hover:border-primary/30 dark:hover:border-secondary/30 backdrop-blur-sm hover:scale-105"
              }`}
              title={!sidebarExpanded ? "New chat +" : ""}
            >
              {/* Background glow effect for active state */}
              {pathname === "/dashboard" && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent dark:from-white/10 dark:to-blue-900/20 pointer-events-none"></div>
              )}

              {/* Button content */}
              <div className="relative flex items-center gap-4">
                <div
                  className={`p-2 rounded-xl transition-all duration-300 ${
                    pathname === "/dashboard"
                      ? "bg-white/20 dark:bg-white/10"
                      : "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                  }`}
                >
                  <SparklesIcon
                    className={`w-5 h-5 transition-all duration-300 ${
                      pathname === "/dashboard"
                        ? "text-white"
                        : "text-primary dark:text-secondary group-hover:text-primary dark:group-hover:text-secondary"
                    }`}
                  />
                </div>
                {sidebarExpanded && (
                  <span className="relative font-semibold">New chat +</span>
                )}
              </div>

              {/* Sparkle animation for active state */}
              {pathname === "/dashboard" && (
                <div className="absolute top-2 right-2 w-1 h-1 bg-white/60 rounded-full animate-ping"></div>
              )}
            </Link>
          </div>

          {/* Menu Items */}
          <nav className="space-y-3">
            {menuItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-4 rounded-2xl py-3 px-4 font-medium transition-all duration-300 animate-in slide-in-from-left fade-in ${
                  sidebarExpanded ? "" : "justify-center"
                } ${
                  item.active
                    ? "bg-white/80 dark:bg-boxdark/80 text-primary dark:text-secondary border border-primary/20 dark:border-secondary/20 shadow-lg dark:shadow-2xl backdrop-blur-xl"
                    : "text-body dark:text-bodydark hover:bg-white/50 dark:hover:bg-boxdark/50 hover:text-black dark:hover:text-white border border-transparent hover:border-stroke/30 dark:hover:border-strokedark/40 backdrop-blur-sm hover:scale-105"
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
                title={!sidebarExpanded ? item.label : ""}
              >
                {/* Hover gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <div className="relative flex items-center gap-4">
                  {/* Icon container */}
                  <div
                    className={`p-2 rounded-xl transition-all duration-300 group-hover:scale-110 ${
                      item.active
                        ? "bg-primary/10 dark:bg-secondary/20"
                        : "bg-stroke/20 dark:bg-strokedark/30 group-hover:bg-primary/10 dark:group-hover:bg-secondary/20"
                    }`}
                  >
                    <item.icon
                      className={`w-5 h-5 transition-colors duration-300 ${
                        item.active
                          ? "text-primary dark:text-secondary"
                          : "text-body dark:text-bodydark group-hover:text-primary dark:group-hover:text-secondary"
                      }`}
                    />
                  </div>

                  {/* Label */}
                  {sidebarExpanded && (
                    <span className="relative font-medium">{item.label}</span>
                  )}
                </div>

                {/* Active indicator */}
                {item.active && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-primary dark:bg-secondary rounded-full animate-pulse"></div>
                  </div>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* Footer Section */}
        <div className="px-4 lg:px-6 pb-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-white/60 to-gray-50/60 dark:from-boxdark/60 dark:to-meta-4/60 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm">
            {sidebarExpanded ? (
              <div className="text-center">
                <p className="text-xs text-body/60 dark:text-bodydark/60 mb-2">
                  Powered by Materialize AI ✨
                </p>
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-body dark:text-bodydark">
                  <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
                  <span>All systems operational</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
