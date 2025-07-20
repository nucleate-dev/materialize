"use client";

import { logout, useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import Link from "next/link";

export default function Header() {
  const user = useUser();
  return (
    <nav className="bg-white shadow-sm p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="text-xl font-semibold text-gray-800">
          <a href="">MyApp</a>
        </div>
        <div className="space-x-6">
          <a href="#features" className="text-gray-600 hover:text-gray-800">
            Features
          </a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-800">
            Pricing
          </a>
          <a href="#testimonials" className="text-gray-600 hover:text-gray-800">
            Testimonials
          </a>
          <a href="#faq" className="text-gray-600 hover:text-gray-800">
            FAQ
          </a>
        </div>
        <div className="space-x-4">
          {user.user === null ? (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="px-4 py-2  text-white rounded-lg hover:bg-purple-700 bg-purple-600"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/"
                onClick={() => logout()}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Logout
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-2 text-white rounded-lg hover:bg-purple-700 bg-purple-600"
              >
                Dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
