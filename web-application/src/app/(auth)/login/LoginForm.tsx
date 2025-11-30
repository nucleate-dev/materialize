"use client";

import ErrorModal from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/hooks/useUser";
import { redirectAfterLoginAtom } from "@/lib/atoms/sidebar";
import { login, signInWithOAuth } from "@/lib/utils/auth/SupabaseAuthUtils";
import { Provider } from "@supabase/supabase-js";
import { useAtom } from "jotai";
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { OAuthSignInButton } from "../AuthComponents";
import RegistrationAccountCreatedEmailVerificationPending from "../register/RegistrationAccountCreatedEmailVerificationPending";

const LAST_LOGIN_METHOD_KEY = "lastLoginMethod";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userIsLoading } = useUser();
  const [, setRedirectAfterLogin] = useAtom(redirectAfterLoginAtom);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showVerifyEmailState, setShowVerifyEmailState] =
    useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);

  const { email, password } = formData;

  // Load last login method from localStorage on mount
  useEffect(() => {
    const storedMethod = localStorage.getItem(LAST_LOGIN_METHOD_KEY);
    setLastLoginMethod(storedMethod);
  }, []);

  // Store redirect parameter in Jotai atom if present
  useEffect(() => {
    const redirectParam = searchParams.get("redirect");
    if (redirectParam) {
      const decodedRedirect = decodeURIComponent(redirectParam);
      setRedirectAfterLogin(decodedRedirect);
    }
  }, [searchParams, setRedirectAfterLogin]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsLoading(true);

      const loginResponse = await login({
        email,
        password,
      });

      setIsLoading(false);

      if (loginResponse.error) {
        setShowErrorModal(true);
        setErrorMessage(loginResponse.error.message);
        return;
      }
      if (
        loginResponse.data.user != null &&
        loginResponse.data.session != null
      ) {
        // Store that email/password was used for login
        localStorage.setItem(LAST_LOGIN_METHOD_KEY, "email");
        router.push("/auth/callback");
      } else if (loginResponse.data.session == null) {
        setShowVerifyEmailState(true);
      }
    },
    [
      setShowErrorModal,
      setErrorMessage,
      router,
      setShowVerifyEmailState,
      email,
      password,
    ],
  );

  const handleOAuthSignIn = useCallback(
    async (provider: Provider) => {
      // Store the OAuth provider as the last login method
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, provider);
      // Store redirect parameter if present
      const redirectParam = searchParams.get("redirect");
      if (redirectParam) {
        const decodedRedirect = decodeURIComponent(redirectParam);
        setRedirectAfterLogin(decodedRedirect);
      }
      await signInWithOAuth(provider, "/auth/callback");
    },
    [searchParams, setRedirectAfterLogin],
  );

  // Redirect to dashboard if user is already logged in
  useEffect(() => {
    if (!userIsLoading && user) {
      router.push("/dashboard");
    }
  }, [user, userIsLoading, router]);

  // Show loading while checking authentication
  if (userIsLoading) {
    return (
      <div className="w-full max-w-md mx-auto flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4 text-[#8A8F98]">
          <Loader2 className="w-8 h-8 animate-spin text-white/20" />
          <p className="text-sm">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (showVerifyEmailState) {
    return (
      <div>
        <RegistrationAccountCreatedEmailVerificationPending />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ErrorModal
        show={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
        }}
        errorMessage={errorMessage}
      />

      {/* Premium Card Container */}
      <div className="bg-[#141517] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center space-y-2 border-b border-white/5 bg-white/[0.01]">
          <div className="mx-auto w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 mb-4 shadow-inner">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-medium tracking-tight text-white">
            Welcome back
          </h2>
          <p className="text-[#8A8F98] text-sm">
            Enter your credentials to access your account
          </p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-[#8A8F98]"
                >
                  Email
                </Label>
                {lastLoginMethod === "email" && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Last used
                  </span>
                )}
              </div>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                required
                value={email}
                onChange={handleChange}
                disabled={isLoading}
                className="bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium text-[#8A8F98]"
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                value={password}
                onChange={handleChange}
                disabled={isLoading}
                className="bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-white text-black hover:bg-white/90 font-medium mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full bg-white/5" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#141517] px-2 text-[#8A8F98]">Or</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <OAuthSignInButton
                onClick={async () => {
                  await handleOAuthSignIn("google");
                }}
                provider="google"
                showOnlyLogo={false}
              />
              {lastLoginMethod === "google" && (
                <span className="absolute top-1/2 right-3 -translate-y-1/2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 pointer-events-none">
                  Last used
                </span>
              )}
            </div>
          </div>

          <div className="text-center text-sm">
            <Link
              href="/forgot_password"
              className="text-white/60 hover:text-white transition-colors text-xs"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
