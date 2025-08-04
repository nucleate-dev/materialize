import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types/database.types";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";

export type PrototypeInsert = Database["public"]["Tables"]["prototypes"]["Insert"];

type PrototypeFileInsert = Omit<
  Database["public"]["Tables"]["prototype_files"]["Insert"],
  "prototype_id"
>;

export type CreatePrototypeResult = 
  | { success: true; data: Database["public"]["Tables"]["prototypes"]["Row"] }
  | { success: false; error: "PROTOTYPE_LIMIT_REACHED" | "DATABASE_ERROR"; message: string };

export async function createPrototype(
  supabase: SupabaseClient<Database>,
  prototype: PrototypeInsert,
  subscriptionPlan: Database["public"]["Enums"]["subscription_plan_type"],
  files: PrototypeFileInsert[] | null = null,
): Promise<CreatePrototypeResult> {
  if (!prototype.visibility) {
    prototype.visibility =
      subscriptionPlan === "pro" ? "SELF" : "PUBLIC";
  }

  // Check prototype limit for free users
  if (subscriptionPlan === "free") {
    if (!prototype.owner_id) {
      return {
        success: false,
        error: "DATABASE_ERROR",
        message: "Owner ID is required"
      };
    }

    const { count, error: countError } = await supabase
      .from("prototypes")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", prototype.owner_id);

    if (countError) {
      return {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to check prototype count"
      };
    }

    if (count !== null && count >= 5) {
      return {
        success: false,
        error: "PROTOTYPE_LIMIT_REACHED",
        message: "Free plan allows maximum 5 prototypes. Upgrade to Pro for unlimited prototypes."
      };
    }
  }

  const { data, error } = await supabase
    .from("prototypes")
    .insert(prototype)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: error.message
    };
  }

  const filesToInsert: Database["public"]["Tables"]["prototype_files"]["Insert"][] =
    files
      ? files.map((file) => ({ ...file, prototype_id: data.id }))
      : (getDefaultPrototypeFiles(
          data.id,
        ) as Database["public"]["Tables"]["prototype_files"]["Insert"][]);

  const { error: filesError } = await supabase
    .from("prototype_files")
    .insert(filesToInsert);

  if (filesError) {
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: filesError.message
    };
  }

  return {
    success: true,
    data
  };
}
