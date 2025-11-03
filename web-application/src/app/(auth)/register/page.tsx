"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RegistrationForm from "./RegistrationForm";

export default function Register() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const loginHref = redirectParam ? `/login?redirect=${redirectParam}` : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Create an account
          </h1>
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={loginHref}
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
        <RegistrationForm />
      </div>
    </div>
  );
}
