"use client";

import { useRequireAuth } from "@/lib/utils/auth/SupabaseAuthUtils";

export default function RequireAuth() {
  useRequireAuth();
  return <></>;
}
