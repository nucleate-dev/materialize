"use client";

import { Button } from "@/components/Button";
import ErrorModal from "@/components/ErrorModal";
import { TextField } from "@/components/Fields";
import {
  isValidEmailInput,
  isValidPassword
} from "@/lib/utils/auth/AuthFormValidationUtils";
import { signInWithOAuth, signUp } from "@/lib/utils/auth/SupabaseAuthUtils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useState } from "react";
import { OAuthSignInButton } from "../AuthComponents";
import RegistrationAccountCreatedEmailVerificationPending from "./RegistrationAccountCreatedEmailVerificationPending";

export default function RegistrationForm() {
  // Declare state variables
  const router = useRouter();
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
  const { email, password, firstName, lastName, confirmPassword } =
    formData;
  const { emailError, passwordError, confirmPasswordError } =
    formErrors;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData({
        ...formData,
        [name]: value,
      });
      if (name === "email") {
        if (isValidEmailInput(value)) {
          setFormErrors({
            ...formErrors,
            emailError: "",
          });
        } else {
          setFormErrors({
            ...formErrors,
            emailError: "Please enter a valid email",
          });
        }
      } else if (name === "password") {
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
    [formData, formErrors, password, setFormData, setFormErrors]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const authResponse = await signUp({
        email,
        password,
        firstName,
        lastName,
      });
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
    [email, firstName, lastName, password, router]
  );

  if (showSuccessState) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div>
      <ErrorModal
        show={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
        }}
        errorMessage={errorMessage}
      />
      <form
        onSubmit={handleSubmit}
        action="#"
        className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 px-4"
      >
        <TextField
          label="First name"
          name="firstName"
          type="text"
          autoComplete="given-name"
          required
          value={firstName}
          onChange={handleChange}
        />
        <TextField
          label="Last name"
          name="lastName"
          type="text"
          autoComplete="family-name"
          required
          value={lastName}
          onChange={handleChange}
        />
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={handleChange}
          error={emailError}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={handleChange}
          error={passwordError}
        />
        <TextField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={handleChange}
          error={confirmPasswordError}
        />
        <div className="col-span-full">
          <Button type="submit" value="Create Account" />
        </div>
        <div className="col-span-full grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* add or remove OAuth buttons here as desired. The second parameter is the redirect URL */}
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("google", "/register/callback");
            }}
            provider="google"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("apple", "/register/callback");
            }}
            provider="apple"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("facebook", "/register/callback");
            }}
            provider="facebook"
            showOnlyLogo
          />
          <OAuthSignInButton
            onClick={async () => {
              await signInWithOAuth("github", "/register/callback");
            }}
            provider="github"
            showOnlyLogo
          />
        </div>
        <div className="mt-1 text-center">
          <p>
            Already have an account?{" "}
            <Link href="/login" className="text-primary">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
