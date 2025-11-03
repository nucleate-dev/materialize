"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoginForm from "./LoginForm";

export default function Login() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const registerHref = redirectParam ? `/register?redirect=${redirectParam}` : "/register";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={registerHref}
              className="text-primary hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
