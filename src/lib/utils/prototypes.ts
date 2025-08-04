import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types/database.types";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";

export type PrototypeInsert = Database["public"]["Tables"]["prototypes"]["Insert"];

type PrototypeFileInsert = Omit<
  Database["public"]["Tables"]["prototype_files"]["Insert"],
  "prototype_id"
>;

export async function createPrototype(
  supabase: SupabaseClient<Database>,
  prototype: PrototypeInsert,
  subscriptionPlan: Database["public"]["Enums"]["subscription_plan_type"],
  files: PrototypeFileInsert[] | null = null,
) {
  if (!prototype.visibility) {
    prototype.visibility =
      subscriptionPlan === "pro" ? "SELF" : "PUBLIC";
  }

  const { data, error } = await supabase
    .from("prototypes")
    .insert(prototype)
    .select()
    .single();

  if (error) {
    throw error;
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
    throw filesError;
  }

  return data;
}
