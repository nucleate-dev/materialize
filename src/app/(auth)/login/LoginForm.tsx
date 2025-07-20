"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Fields";
import React, { ChangeEvent, FormEvent, useCallback, useState } from "react";
import RegistrationAccountCreatedEmailVerificationPending from "../register/RegistrationAccountCreatedEmailVerificationPending";
import ErrorModal from "@/components/ErrorModal";
import Link from "next/link";
import { OAuthSignInButton } from "../AuthComponents";
import { login, signInWithOAuth } from "@/lib/utils/auth/SupabaseAuthUtils";

export default function LoginForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showVerifyEmailState, setShowVerifyEmailState] =
    useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const { email, password } = formData;

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
      const loginResponse = await login({
        email,
        password,
      });
      if (loginResponse.error) {
        setShowErrorModal(true);
        setErrorMessage(loginResponse.error.message);
        return;
      }
      if (
        loginResponse.data.user != null &&
        loginResponse.data.session != null
      ) {
        router.push("/auth/callback");
      } else if (loginResponse.data.session == null) {
        setShowVerifyEmailState(true);
      }
    },
    [
      login,
      setShowErrorModal,
      setErrorMessage,
      router,
      setShowVerifyEmailState,
      email,
      password,
    ]
  );

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
      <form
        action="#"
        className="mt-4 grid grid-cols-1 gap-y-4"
        onSubmit={handleSubmit}
      >
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={handleChange}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={handleChange}
        />
        <div>
          <Button type="submit" value="Sign in" />
        </div>
        <div className="col-span-full grid grid-cols-4 gap-4">
          {/* add or remove OAuth buttons here as desired. The second parameter is the redirect URL */}
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("google", "/login/callback");
            }}
            provider="google"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("apple", "/login/callback");
            }}
            provider="apple"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("facebook", "/login/callback");
            }}
            provider="facebook"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("github", "/login/callback");
            }}
            provider="github"
            showOnlyLogo
          />
        </div>
        <div className="my-4 text-center">
          <p>
            Forgot your password? Reset it{" "}
            <Link href="/forgot_password" className="text-primary">
              here
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}
