"use client";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Atom } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PremiumHeader() {
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
            item,
            ...props,
          },
        });
      },
    [logger],
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
          ? "bg-background/90 backdrop-blur-xl border-b border-border py-3"
          : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto px-6">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <Link
              href={user ? "/dashboard" : "/"}
              className="flex items-center gap-2 text-2xl font-bold text-foreground hover:opacity-80 transition-opacity duration-200"
            >
              <Atom className="w-6 h-6 text-primary" />
              <span>Nucleate</span>
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-3">
            <Link
              href="/blog"
              onClick={() => logHeaderClick("blog", { destination: "/blog" })}
              className="hidden md:block transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Blog
            </Link>
            <Link
              href="/for-vibe-coding"
              onClick={() =>
                logHeaderClick("for_vibe_coding", {
                  destination: "/for-vibe-coding",
                })
              }
              className="hidden md:block transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              For Vibe Coding
            </Link>
            {userIsLoading ? (
              <div className="px-4 py-2 rounded-full text-sm border border-border text-muted-foreground">
                Loading...
              </div>
            ) : user ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm bg-primary text-primary-foreground"
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
                  className="px-4 py-2 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
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
                  className="px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm bg-primary text-primary-foreground"
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
