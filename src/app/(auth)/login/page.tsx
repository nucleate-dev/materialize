import Link from "next/link";
import LoginForm from "./LoginForm";

import React from "react";

export default function Login() {
  return (
    <div className="w-full min-h-screen grid place-items-center bg-white">
      <div className="max-w-md w-full">
        <div className="flex flex-row justify-between">
          <h2 className="text-lg font-semibold text-black">
            Sign in to your account
          </h2>
          <div className="text-center">
            <p>
              <Link href="/register" className="text-primary hover:font-bold">
                Register
              </Link>
            </p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
