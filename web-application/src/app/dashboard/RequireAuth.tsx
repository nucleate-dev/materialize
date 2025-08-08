"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function RequireAuth() {
  useRequireAuth();
  return <></>;
}
