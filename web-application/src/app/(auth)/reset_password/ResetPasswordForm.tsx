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
import { updatePasswordForUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { isValidPassword } from "@/lib/utils/auth/AuthFormValidationUtils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useState } from "react";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [formErrors, setFormErrors] = useState({
    passwordError: "",
    confirmPasswordError: "",
  });
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);
  const { password, confirmPassword } = formData;
  const { passwordError, confirmPasswordError } = formErrors;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData({
        ...formData,
        [name]: value,
      });
      if (name === "password") {
        const passwordError = isValidPassword(value);
        if (passwordError) {
          setFormErrors({
            ...formErrors,
            passwordError,
          });
        } else {
          // otherwise remove the password error
          setFormErrors({
            ...formErrors,
            passwordError: "",
          });
        }
      } else if (name === "confirmPassword") {
        if (password !== value) {
          setFormErrors({
            ...formErrors,
            confirmPasswordError: "Passwords do not match",
          });
        } else {
          setFormErrors({
            ...formErrors,
            confirmPasswordError: "",
          });
        }
      }
    },
    [formData, formErrors, password],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsLoading(true);

      const response = await updatePasswordForUser({
        newPassword: password,
      });

      setIsLoading(false);

      if (response.error) {
        setShowErrorModal(true);
        setErrorMessage(response.error.message);
        return;
      }

      setShowSuccessState(true);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    },
    [password, router, setShowErrorModal, setErrorMessage],
  );

  if (showSuccessState) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Password updated!
          </CardTitle>
          <CardDescription className="text-center">
            Your password has been successfully reset
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              Redirecting you to your dashboard...
            </p>
          </div>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
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
            Reset Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password to complete the reset process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your new password"
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
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
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
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                !!passwordError ||
                !!confirmPasswordError ||
                !password ||
                !confirmPassword
              }
            >
              {isLoading ? "Updating password..." : "Update password"}
            </Button>
          </form>

          <div className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
