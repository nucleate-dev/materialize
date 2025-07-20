import React from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export default function resetPassword() {
  return (
    <div className="w-full min-h-screen grid place-items-center bg-white">
      <div className="max-w-md w-full">
        <h2 className="text-lg font-semibold text-black">
          Reset your password
        </h2>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
