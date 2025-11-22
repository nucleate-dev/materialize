"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RegistrationForm from "./RegistrationForm";

// --- Visual Background (Consistent across pages) ---
const GridBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none -z-10">
    <div className="absolute inset-0 bg-[#0B0C0E]" />
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen" />
    <div className="absolute bottom-[20%] right-[10%] w-[30%] h-[30%] bg-blue-500/10 blur-[100px] rounded-full mix-blend-screen" />
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-transparent to-transparent" />
  </div>
);

function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const loginHref = redirectParam ? `/login?redirect=${redirectParam}` : "/login";

  return (
    <main className="relative min-h-screen bg-[#0B0C0E] text-white overflow-hidden font-sans">
      <GridBackground />

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
    <Suspense fallback={<div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center text-[#8A8F98]">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}