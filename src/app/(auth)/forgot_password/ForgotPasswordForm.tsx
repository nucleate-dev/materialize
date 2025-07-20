"use client";

import { Button } from "@/components/Button";
import { TextField } from "@/components/Fields";
import React, { ChangeEvent, FormEvent, useState } from "react";
import ErrorModal from "@/components/ErrorModal";
import { sendPasswordResetToEmail } from "@/lib/utils/auth/SupabaseAuthUtils";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [formEmailError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const error = await sendPasswordResetToEmail({
      email,
      redirectTo: process.env.NEXT_PUBLIC_SITE_BASE_URL + "/reset_password",
    });
    if (error) {
      setShowErrorModal(true);
      setErrorMessage(error.message);
      return;
    }
    setShowSuccessState(true);
  };

  if (showSuccessState) {
    return (
      <div className="mt-10 mx-auto max-w-lg">
        <h2 className="mt-20 text-lg font-semibold text-gray-900">
          We sent you an email!
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          {" "}
          Please click the link in your inbox to reset your password.{" "}
        </p>
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
          onChange={handleEmailChange}
          error={formEmailError}
        />
        <div>
          <Button type="submit" value="Send reset link" />
        </div>
      </form>
    </>
  );
}
