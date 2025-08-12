import { Database } from "@/lib/types/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

export interface PrototypeAuthResult {
  success: boolean;
  userId: string;
  subscriptionPlan: Database["public"]["Enums"]["subscription_plan_type"];
  error?: string;
  message?: string;
}

export interface PrototypeLimitCheck {
  canCreate: boolean;
  currentCount: number;
  maxAllowed: number;
  error?: string;
  message?: string;
}

/**
 * Authenticate user and get subscription information
 */
export async function authenticatePrototypeUser(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<PrototypeAuthResult> {
  try {
    // Verify JWT token with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        success: false,
        userId: "",
        subscriptionPlan: "free",
        error: "AUTH_ERROR",
        message: "Invalid or expired authentication token",
      };
    }

    // Get user's subscription plan
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (subscriptionError) {
      console.error("Error fetching subscription:", subscriptionError);
      // Default to free plan if there's an error
      return {
        success: true,
        userId: user.id,
        subscriptionPlan: "free",
      };
    }

    const subscriptionPlan = subscription?.plan_id || "free";

    return {
      success: true,
      userId: user.id,
      subscriptionPlan,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    return {
      success: false,
      userId: "",
      subscriptionPlan: "free",
      error: "AUTH_ERROR",
      message: "Authentication failed",
    };
  }
}

/**
 * Check if user can create more prototypes based on their subscription plan
 */
export async function checkPrototypeLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  subscriptionPlan: Database["public"]["Enums"]["subscription_plan_type"],
): Promise<PrototypeLimitCheck> {
  try {
    // Free users are limited to 5 prototypes
    const maxAllowed = subscriptionPlan === "free" ? 5 : Infinity;

    if (maxAllowed === Infinity) {
      return {
        canCreate: true,
        currentCount: 0,
        maxAllowed,
      };
    }

    // Count existing prototypes for free users
    const { count, error: countError } = await supabase
      .from("prototypes")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", userId);

    if (countError) {
      return {
        canCreate: false,
        currentCount: 0,
        maxAllowed,
        error: "DATABASE_ERROR",
        message: "Failed to check prototype count",
      };
    }

    const currentCount = count || 0;
    const canCreate = currentCount < maxAllowed;

    return {
      canCreate,
      currentCount,
      maxAllowed,
      error: canCreate ? undefined : "PROTOTYPE_LIMIT_REACHED",
      message: canCreate
        ? undefined
        : `Free plan allows maximum ${maxAllowed} prototypes. Upgrade to Pro for unlimited prototypes.`,
    };
  } catch (error) {
    console.error("Error checking prototype limit:", error);
    return {
      canCreate: false,
      currentCount: 0,
      maxAllowed: 5,
      error: "DATABASE_ERROR",
      message: "Failed to check prototype limits",
    };
  }
}

/**
 * Get prototype files for forking
 */
export async function getPrototypeFiles(
  supabase: SupabaseClient<Database>,
  prototypeId: string,
): Promise<{
  success: boolean;
  files?: Database["public"]["Tables"]["prototype_files"]["Row"][];
  error?: string;
  message?: string;
}> {
  try {
    const { data: files, error } = await supabase
      .from("prototype_files")
      .select("*")
      .eq("prototype_id", prototypeId);

    if (error) {
      return {
        success: false,
        error: "DATABASE_ERROR",
        message: error.message,
      };
    }

    if (!files || files.length === 0) {
      return {
        success: false,
        error: "NO_FILES_FOUND",
        message: "No files found for the specified prototype",
      };
    }

    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error("Error fetching prototype files:", error);
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to fetch prototype files",
    };
  }
}
