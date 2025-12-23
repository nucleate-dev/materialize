"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { GridBackground } from "@/components/shared/GridComponent";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RegistrationForm from "./RegistrationForm";

function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const loginHref = redirectParam
    ? `/login?redirect=${redirectParam}`
    : "/login";

  return (
    <main className="relative min-h-screen bg-background text-foreground overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <div className="flex items-center justify-center px-6 py-24 min-h-[calc(100vh-80px)]">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground/80 to-foreground/60">
                Create an account
              </h1>
              <p className="text-muted-foreground text-lg">
                Already have an account?{" "}
                <Link
                  href={loginHref}
                  className="text-foreground hover:text-primary transition-colors font-medium"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <RegistrationForm />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Register() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
