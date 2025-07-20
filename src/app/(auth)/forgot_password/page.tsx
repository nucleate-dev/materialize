import React from "react";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function forgotPassword() {
  return (
    <div className="w-full min-h-screen grid place-items-center bg-white">
      <div className="max-w-md w-full">
        <h2 className="text-lg font-semibold text-black">
          Reset your password
        </h2>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
