"use client";

import { Button } from "@/components/Button";
import { TextField } from "@/components/Fields";
import { ChangeEvent, FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorModal from "@/components/ErrorModal";
import { updatePasswordForUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { isValidPassword } from "@/lib/utils/auth/AuthFormValidationUtils";

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
    [formData, formErrors, password]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const response = await updatePasswordForUser({
        newPassword: password,
      });
      if (response.error) {
        setShowErrorModal(true);
        setErrorMessage(response.error.message);
        return;
      }
      router.push("/dashboard");
    },
    [password, router, setShowErrorModal, setErrorMessage]
  );

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
        className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2"
      >
        <TextField
          className="col-span-full"
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
          className="col-span-full"
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
          <Button type="submit" value="Reset password" />
        </div>
      </form>
    </div>
  );
}
