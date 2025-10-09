import type { User } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/supabase";

type PublicUserRow = Database["public"]["Tables"]["users"]["Row"] & {
  is_test_user?: boolean | null;
};

type MaybeTestUser =
  | Pick<User, "app_metadata" | "user_metadata">
  | PublicUserRow
  | {
      app_metadata?: unknown;
      user_metadata?: unknown;
      is_test_user?: unknown;
    }
  | null
  | undefined;

function extractBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return null;
}

export function isTestUser(user: MaybeTestUser): boolean {
  if (!user) {
    return false;
  }

  if ("is_test_user" in user) {
    const directFlag = extractBooleanFlag((user as { is_test_user?: unknown }).is_test_user);
    if (directFlag !== null) {
      return directFlag;
    }
  }

  const userMetadata = (user as { user_metadata?: unknown }).user_metadata;
  if (userMetadata && typeof userMetadata === "object" && !Array.isArray(userMetadata)) {
    const metadataFlag = extractBooleanFlag(
      (userMetadata as Record<string, unknown>).is_test_user
    );
    if (metadataFlag !== null) {
      return metadataFlag;
    }
  }

  const appMetadata = (user as { app_metadata?: unknown }).app_metadata;
  if (appMetadata && typeof appMetadata === "object" && !Array.isArray(appMetadata)) {
    const appMetadataFlag = extractBooleanFlag(
      (appMetadata as Record<string, unknown>).is_test_user
    );
    if (appMetadataFlag !== null) {
      return appMetadataFlag;
    }

    const roles = (appMetadata as Record<string, unknown>).roles;
    if (Array.isArray(roles)) {
      return roles.includes("test");
    }
  }

  return false;
}
