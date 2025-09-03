"use client";
import { useSidebar } from "@/hooks/useSidebar";
import { useProject } from "@/hooks/useProject";
import {
  Bars3Icon,
  ClockIcon,
  RocketLaunchIcon,
  Square3Stack3DIcon,
  Cog6ToothIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { SHOW_WHITEBOARDS } from "@/GlobalConstants";

export default function ProjectsHeader() {
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const pathname = usePathname();
  const params = useParams();
  const projectId = params?.project_id as string;
  const { project, isLoading } = useProject(projectId);

  const tabs = [
    {
      name: "Recent",
      href: `/dashboard/projects/${projectId}`,
      icon: ClockIcon,
      active: pathname === `/dashboard/projects/${projectId}`,
    },
    {
      name: "Prototypes",
      href: `/dashboard/projects/${projectId}/prototypes`,
      icon: RocketLaunchIcon,
      active: pathname?.includes("/prototypes"),
    },
    ...(SHOW_WHITEBOARDS
      ? [
          {
            name: "Whiteboards",
            href: `/dashboard/projects/${projectId}/whiteboards`,
            icon: Square3Stack3DIcon,
            active: pathname?.includes("/whiteboards"),
          },
        ]
      : []),
    {
      name: "Settings",
      href: `/dashboard/projects/${projectId}/settings`,
      icon: Cog6ToothIcon,
      active: pathname?.includes("/settings"),
    },
  ];

  return (
    <header className="sticky top-0 z-999 w-full">
      {/* Enhanced Glassmorphism Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-gray-2/85 to-whiter/90 dark:from-boxdark/90 dark:via-boxdark-2/85 dark:to-meta-4/90 backdrop-blur-xl"></div>

      {/* Multi-layered Border System */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-stroke/60 to-transparent dark:via-strokedark/60"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/20 via-secondary/30 to-meta-5/20 dark:from-primary/30 dark:via-secondary/40 dark:to-meta-5/30 blur-sm"></div>

      {/* Enhanced Shadow */}
      <div className="absolute -bottom-6 left-0 right-0 h-6 bg-gradient-to-b from-black/5 to-transparent dark:from-black/12 dark:to-transparent pointer-events-none"></div>

      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-10 -right-20 w-32 h-32 bg-gradient-to-br from-primary/8 to-secondary/8 dark:from-primary/15 dark:to-secondary/15 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -top-10 -left-20 w-24 h-24 bg-gradient-to-tr from-meta-5/8 to-meta-3/8 dark:from-meta-5/15 dark:to-meta-3/15 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-r from-primary/3 via-secondary/3 to-meta-5/3 dark:from-primary/8 dark:via-secondary/8 dark:to-meta-5/8 rounded-full blur-2xl animate-spin"
          style={{ animationDuration: "20s" }}
        ></div>
      </div>

      {/* Header Content */}
      <div className="relative z-10 flex flex-grow items-center justify-between px-6 py-1 md:px-8 2xl:px-12">
        {/* Left Section - Mobile Menu & Project Name */}
        <div className="flex items-center gap-4">
          {/* Modern Mobile Toggle Button */}
          <div className="lg:hidden">
            <button
              aria-controls="sidebar"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen(!sidebarOpen);
              }}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <Bars3Icon className="relative w-5 h-5 text-body dark:text-bodydark transition-colors duration-300 group-hover:text-primary dark:group-hover:text-secondary" />
            </button>
          </div>

          {/* Project Name Display */}
          <div className="flex items-center gap-3">
            {/* Project Icon Container */}
            <div className="relative p-2.5 bg-gradient-to-br from-primary/10 via-secondary/5 to-meta-5/10 dark:from-primary/20 dark:via-secondary/10 dark:to-meta-5/20 rounded-xl border border-primary/20 dark:border-secondary/30 backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-xl blur-sm opacity-50"></div>
              <FolderIcon className="relative w-5 h-5 text-primary dark:text-secondary" />
            </div>

            {/* Project Name & Loading State */}
            <div className="flex flex-col justify-center min-w-0">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-32 bg-gradient-to-r from-stroke/30 to-stroke/20 dark:from-strokedark/30 dark:to-strokedark/20 rounded-lg animate-pulse"></div>
                </div>
              ) : project ? (
                <>
                  <h1 className="text-xl font-bold text-black dark:text-white leading-tight truncate max-w-xs md:max-w-sm lg:max-w-md">
                    {project.name}
                  </h1>
                  <span className="text-xs font-medium text-body dark:text-bodydark opacity-75 uppercase tracking-wide">
                    Project
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold text-body dark:text-bodydark opacity-75">
                  Project Not Found
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Section - Navigation Tabs */}
        <div className="flex-1 flex justify-center">
          <nav className="flex items-center space-x-3 p-2">
            {tabs.map((tab, index) => (
              <Link
                key={tab.name}
                href={tab.href}
                className={`relative group flex items-center gap-3 px-3 md:px-6 py-3 rounded-xl font-semibold transition-all duration-500 transform-gpu ${
                  tab.active
                    ? "bg-white dark:bg-boxdark text-black dark:text-white shadow-lg border border-stroke/20 dark:border-strokedark/20 scale-100 hover:scale-105"
                    : "text-body dark:text-bodydark hover:bg-white/80 dark:hover:bg-boxdark/80 hover:text-black dark:hover:text-white border border-transparent hover:border-stroke/30 dark:hover:border-strokedark/40 backdrop-blur-sm hover:scale-105"
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Background glow effect for active state */}
                {tab.active && (
                  <div className="absolute inset-0 rounded-xl bg-white/10 dark:bg-white/5 pointer-events-none"></div>
                )}

                {/* Hover gradient effect for inactive tabs */}
                {!tab.active && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                )}

                {/* Tab content */}
                <div className="relative flex items-center gap-3">
                  {/* Icon container */}
                  <div
                    className={`p-1.5 rounded-lg transition-all duration-300 ${
                      tab.active
                        ? "bg-primary/10 dark:bg-primary/20"
                        : "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                    }`}
                  >
                    <tab.icon
                      className={`w-4 h-4 transition-all duration-300 ${
                        tab.active
                          ? "text-primary dark:text-secondary"
                          : "text-primary dark:text-secondary group-hover:text-primary dark:group-hover:text-secondary"
                      }`}
                    />
                  </div>

                  {/* Label - Hidden on small screens, visible on medium+ */}
                  <span className="relative font-semibold text-sm hidden md:inline">
                    {tab.name}
                  </span>
                </div>

                {/* Active indicator */}
                {tab.active && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary dark:bg-secondary rounded-full animate-ping"></div>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
