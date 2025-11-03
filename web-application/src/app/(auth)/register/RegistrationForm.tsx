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
import {
  isValidEmailInput,
  isValidPassword,
} from "@/lib/utils/auth/AuthFormValidationUtils";
import { signInWithOAuth, signUp } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { OAuthSignInButton } from "../AuthComponents";
import RegistrationAccountCreatedEmailVerificationPending from "./RegistrationAccountCreatedEmailVerificationPending";

export default function RegistrationForm() {
  // Declare state variables
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [formErrors, setFormErrors] = useState({
    emailError: "",
    passwordError: "",
    confirmPasswordError: "",
  });
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { email, password, firstName, lastName, confirmPassword } = formData;
  const { emailError, passwordError, confirmPasswordError } = formErrors;

  // Check if form has any validation errors or missing required fields
  const hasErrors = emailError || passwordError || confirmPasswordError;
  const hasRequiredFields = email && password && firstName && lastName && confirmPassword;
  const isFormValid = !hasErrors && hasRequiredFields;

  // Store redirect parameter in localStorage if present
  useEffect(() => {
    const redirectParam = searchParams.get("redirect");
    if (redirectParam) {
      localStorage.setItem("redirect_after_login", decodeURIComponent(redirectParam));
    }
  }, [searchParams]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;

      // Update form data using functional update to avoid stale closure
      setFormData((prevFormData) => {
        const newFormData = {
          ...prevFormData,
          [name]: value,
        };

        // Validate based on which field changed
        if (name === "email") {
          if (isValidEmailInput(value)) {
            setFormErrors((prev) => ({ ...prev, emailError: "" }));
          } else {
            setFormErrors((prev) => ({
              ...prev,
              emailError: "Please enter a valid email",
            }));
          }
        } else if (name === "password") {
          const passwordError = isValidPassword(value);
          setFormErrors((prev) => ({ ...prev, passwordError: passwordError || "" }));

          // Revalidate confirmPassword when password changes
          setFormErrors((prev) => {
            if (prev.confirmPasswordError && newFormData.confirmPassword) {
              const confirmPasswordError = newFormData.confirmPassword !== value ? "Passwords do not match" : "";
              return { ...prev, confirmPasswordError };
            }
            return prev;
          });
        } else if (name === "confirmPassword") {
          // Compare against current password in newFormData
          const confirmPasswordError = newFormData.password !== value ? "Passwords do not match" : "";
          setFormErrors((prev) => ({ ...prev, confirmPasswordError }));
        }

        return newFormData;
      });
    },
    [], // No dependencies needed - using functional updates
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Validate all fields before submission
      const emailValidationError = !isValidEmailInput(email) ? "Please enter a valid email" : "";
      const passwordValidationError = isValidPassword(password) || "";
      const confirmPasswordValidationError = password !== confirmPassword ? "Passwords do not match" : "";

      if (emailValidationError || passwordValidationError || confirmPasswordValidationError) {
        setFormErrors({
          emailError: emailValidationError,
          passwordError: passwordValidationError,
          confirmPasswordError: confirmPasswordValidationError,
        });
        return;
      }

      setIsLoading(true);
      const authResponse = await signUp({
        email,
        password,
        firstName,
        lastName,
      });
      setIsLoading(false);
      if (authResponse.error) {
        setShowErrorModal(true);
        setErrorMessage(authResponse.error.message);
        return;
      }

      if (authResponse.data.session) {
        router.push("/auth/callback");
      } else {
        setShowSuccessState(true);
      }
    },
    [email, firstName, lastName, password, confirmPassword, router],
  );

  if (showSuccessState) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
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
            Register
          </CardTitle>
          <CardDescription className="text-center">
            Enter your details to create your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={handleChange}
                disabled={isLoading}
              />
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={handleChange}
                disabled={isLoading}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={handleChange}
                disabled={isLoading}
              />
              {confirmPasswordError && (
                <p className="text-sm text-destructive">
                  {confirmPasswordError}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
              {isLoading ? "Creating account..." : "Create account"}
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
            <OAuthSignInButton
              onClick={async () => {
                // Store redirect parameter if present
                const redirectParam = searchParams.get("redirect");
                if (redirectParam) {
                  localStorage.setItem("redirect_after_login", decodeURIComponent(redirectParam));
                }
                await signInWithOAuth("google", "/auth/callback");
              }}
              provider="google"
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
