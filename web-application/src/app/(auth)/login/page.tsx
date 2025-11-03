"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoginForm from "./LoginForm";

export default function Login() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const registerHref = redirectParam ? `/register?redirect=${redirectParam}` : "/register";

  return (
    <main className="relative bg-background overflow-hidden min-h-screen">
      {/* Premium Background */}
      <div className="absolute inset-0 bg-gradient-radial from-gray-100/20 via-background to-background dark:from-gray-600/8 dark:via-background dark:to-background"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-foreground/5 dark:to-foreground/10"></div>

      {/* Subtle depth orbs */}
      <div className="fixed inset-0 z-0 motion-reduce:hidden">
        <div className="absolute top-1/3 -left-1/4 w-64 h-64 bg-gradient-to-r from-blue-100/10 to-emerald-100/10 dark:from-blue-900/5 dark:to-emerald-900/5 rounded-full blur-3xl animate-[drift_20s_ease-in-out_infinite]"></div>
        <div className="absolute bottom-1/3 -right-1/4 w-48 h-48 bg-gradient-to-r from-emerald-100/10 to-blue-100/10 dark:from-emerald-900/5 dark:to-blue-900/5 rounded-full blur-3xl animate-[drift_25s_ease-in-out_infinite_reverse]"></div>
      </div>

      <div className="relative z-10">
        <PremiumHeader />

        <div className="flex items-center justify-center px-4 py-16 min-h-[calc(100vh-80px)]">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground bg-clip-text text-transparent">
                  Welcome back
                </span>
              </h1>
              <p className="text-lg text-foreground/70">
                Don&apos;t have an account?{" "}
                <Link
                  href={registerHref}
                  className="text-foreground hover:underline font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
