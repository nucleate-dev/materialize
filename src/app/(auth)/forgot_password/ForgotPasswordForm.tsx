"use client";

import ErrorModal from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPasswordResetToEmail } from "@/lib/utils/auth/SupabaseAuthUtils";
import Link from "next/link";
import React, { ChangeEvent, FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const error = await sendPasswordResetToEmail({
      email,
      redirectTo: process.env.NEXT_PUBLIC_SITE_BASE_URL + "/reset_password",
    });
    
    setIsLoading(false);
    
    if (error) {
      setShowErrorModal(true);
      setErrorMessage(error.message);
      return;
    }
    setShowSuccessState(true);
  };

  if (showSuccessState) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Check your email</CardTitle>
          <CardDescription className="text-center">
            We&apos;ve sent you a password reset link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Please click the link in your inbox to reset your password.
          </p>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/login">
                Back to login
              </Link>
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
          <CardTitle className="text-2xl font-bold text-center">Forgot Password</CardTitle>
          <CardDescription className="text-center">
            Enter your email address and we&apos;ll send you a link to reset your password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email address"
                autoComplete="email"
                required
                value={email}
                onChange={handleEmailChange}
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Sending reset link..." : "Send reset link"}
            </Button>
          </form>
          
          <div className="text-center text-sm">
            <Link
              href="/login"
              className="text-primary hover:underline"
            >
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
