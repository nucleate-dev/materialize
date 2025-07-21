"use client";

import Header from "@/app/landing_components/Header";
import { Button } from "@/components/Button";


export default function Login() {
  return (
    <div className="w-full min-h-screen bg-white">
      <Header />
      <div className="grid place-items-center min-h-[calc(100vh-80px)]">
        <div className="max-w-md w-full">
          <div className="flex flex-col items-center text-center space-y-6">
            <h2 className="text-2xl font-semibold text-black">
              Login Temporarily Unavailable
            </h2>
            <p className="text-gray-600">
              We're currently working on improving our login system. Join our waitlist to be notified when login is available again.
            </p>
            <div className="w-full">
              <Button
                type="button"
                value="Join Waitlist"
                onClick={() => {
                  // You can add waitlist functionality here
                  alert("Thank you for your interest! We'll notify you when login is available.");
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
