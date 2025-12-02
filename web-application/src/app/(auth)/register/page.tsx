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
    <main className="relative min-h-screen bg-[#0B0C0E] text-white overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader />

        <div className="flex items-center justify-center px-6 py-24 min-h-[calc(100vh-80px)]">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60">
                Create an account
              </h1>
              <p className="text-[#8A8F98] text-lg">
                Already have an account?{" "}
                <Link
                  href={loginHref}
                  className="text-white hover:text-indigo-400 transition-colors font-medium"
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
        <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center text-[#8A8F98]">
          Loading...
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
