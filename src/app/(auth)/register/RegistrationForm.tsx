"use client";

import { TextField } from "@/components/Fields";
import { ChangeEvent, FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import RegistrationAccountCreatedEmailVerificationPending from "./RegistrationAccountCreatedEmailVerificationPending";
import ErrorModal from "@/components/ErrorModal";
import Link from "next/link";
import { Button } from "@/components/Button";
import { OAuthSignInButton } from "../AuthComponents";
import { signInWithOAuth, signUp } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  isValidEmailInput,
  isValidPassword,
  isValidUSPhoneNumber,
} from "@/lib/utils/auth/AuthFormValidationUtils";

export default function RegistrationForm() {
  // Declare state variables
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [formErrors, setFormErrors] = useState({
    phoneNumberError: "",
    emailError: "",
    passwordError: "",
    confirmPasswordError: "",
  });
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { email, password, firstName, lastName, phoneNumber, confirmPassword } =
    formData;
  const { emailError, passwordError, phoneNumberError, confirmPasswordError } =
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
      } else if (name === "phoneNumber") {
        if (!isValidUSPhoneNumber(value)) {
          setFormErrors({
            ...formErrors,
            phoneNumberError:
              "Please enter a valid 10-digit phone number with area code",
          });
        } else {
          setFormErrors({
            ...formErrors,
            phoneNumberError: "",
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
        phoneNumber,
      });
      if (authResponse.error) {
        setShowErrorModal(true);
        setErrorMessage(authResponse.error.message);
        return;
      }

      // Create a user in your database with their unique user ID
      // ALTERNATIVE: save a serverless fx call by using a trigger on your authentication table in postgresql
      const registrationResponse = await fetch(
        "/api/registration/register-user",
        {
          method: "POST",
          body: JSON.stringify({
            phoneNumber,
            email,
            firstName,
            lastName,
            userId: authResponse.data.user?.id,
          }),
        }
      );
      if (registrationResponse.status === 200 && authResponse.data.session) {
        router.push("/auth/callback");
      } else if (registrationResponse.status === 200) {
        setShowSuccessState(true);
      } else {
        setShowErrorModal(true);
        setErrorMessage("There was an error");
      }
    },
    [email, firstName, lastName, password, phoneNumber, router]
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
        className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4"
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
          label="Phone #"
          name="phoneNumber"
          type="tel"
          required
          value={phoneNumber}
          onChange={handleChange}
          error={phoneNumberError}
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
        <div className="col-span-full grid grid-cols-4 gap-4">
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
