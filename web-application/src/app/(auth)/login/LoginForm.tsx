"use client";

import ErrorModal from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { login, signInWithOAuth } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useState,
  useEffect,
} from "react";
import { OAuthSignInButton } from "../AuthComponents";
import RegistrationAccountCreatedEmailVerificationPending from "../register/RegistrationAccountCreatedEmailVerificationPending";

const LAST_LOGIN_METHOD_KEY = "lastLoginMethod";

export default function LoginForm() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
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
    async (provider: string) => {
      // Store the OAuth provider as the last login method
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, provider);
      await signInWithOAuth(provider as any, "/login/callback");
    },
    [],
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
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">Loading...</div>
        </CardContent>
      </Card>
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
    <>
      <ErrorModal
        show={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
        }}
        errorMessage={errorMessage}
      />
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Login
          </CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="email">Email</Label>
                {lastLoginMethod === "email" && (
                  <Badge variant="secondary" className="text-xs">
                    Last used
                  </Badge>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
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
                <Badge
                  variant="secondary"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs"
                >
                  Last used
                </Badge>
              )}
            </div>
          </div>

          <div className="text-center text-sm">
            <Link
              href="/forgot_password"
              className="text-primary hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
