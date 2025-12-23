"use client";
import { useUser } from "@/hooks/useUser";
import { Atom } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";

interface PremiumHeaderProps {
  forceDarkMode?: boolean;
}

export default function PremiumHeader({
  forceDarkMode = false,
}: PremiumHeaderProps) {
  const { user, userIsLoading } = useUser();
  const [isScrolled, setIsScrolled] = useState(false);
  const logger = useProductLogger();

  const logHeaderClick = useMemo(
    () =>
      (item: string, props: Record<string, unknown> = {}) => {
        logger.log({
          event: "client_landing_page_header_item_clicked",
          properties: {
            component: "PremiumHeader",
            theme: forceDarkMode ? "landing_dark" : "landing_light",
            item,
            ...props,
          },
        });
      },
    [logger, forceDarkMode],
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? forceDarkMode
            ? "bg-black/90 backdrop-blur-xl border-b border-gray-700/20 py-3"
            : "bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-gray-200/20 dark:border-gray-700/20 py-3"
          : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto px-6">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <Link
              href={user ? "/dashboard" : "/"}
              className={`flex items-center gap-2 text-2xl font-bold hover:opacity-80 transition-opacity duration-200 ${
                forceDarkMode ? "text-white" : "text-black dark:text-white"
              }`}
            >
              <Atom className="w-6 h-6 text-primary" />
              <span>Nucleate</span>
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-3">
            <Link
              href="/teams"
              onClick={() => logHeaderClick("teams", { destination: "/teams" })}
              className={`hidden md:block transition-all duration-200 text-sm font-medium ${
                forceDarkMode
                  ? "text-white/70 hover:text-white"
                  : "text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white"
              }`}
            >
              For Teams
            </Link>
            <Link
              href="/blog"
              onClick={() => logHeaderClick("blog", { destination: "/blog" })}
              className={`hidden md:block transition-all duration-200 text-sm font-medium ${
                forceDarkMode
                  ? "text-white/70 hover:text-white"
                  : "text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white"
              }`}
            >
              Blog
            </Link>
            {userIsLoading ? (
              <div
                className={`px-4 py-2 rounded-full text-sm ${
                  forceDarkMode
                    ? "border border-white/20 text-white/80"
                    : "border border-black/20 dark:border-white/20 text-black/80 dark:text-white/80"
                }`}
              >
                Loading...
              </div>
            ) : user ? (
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm ${
                  forceDarkMode
                    ? "bg-white text-black"
                    : "bg-black text-white dark:bg-white dark:text-black"
                }`}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() =>
                    logHeaderClick("sign_in", { destination: "/login" })
                  }
                  className={`px-4 py-2 transition-all duration-200 text-sm font-medium ${
                    forceDarkMode
                      ? "text-white/70 hover:text-white"
                      : "text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
                  }`}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() =>
                    logHeaderClick("create_account", {
                      destination: "/register",
                    })
                  }
                  className={`px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm ${
                    forceDarkMode
                      ? "bg-white text-black"
                      : "bg-black text-white dark:bg-white dark:text-black"
                  }`}
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
