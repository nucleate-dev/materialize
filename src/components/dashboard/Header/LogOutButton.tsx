"use client";

import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { ArrowLeftStartOnRectangleIcon } from "@heroicons/react/24/outline";
export default function LogOutButton() {
  return (
    <button
      onClick={logout}
      className="flex items-center gap-3.5 py-4 px-6 text-sm font-medium duration-300 ease-in-out hover:text-primary lg:text-base"
    >
      <ArrowLeftStartOnRectangleIcon className="w-6 h-6" />
      Log Out
    </button>
  );
}
