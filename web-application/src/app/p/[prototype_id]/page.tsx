import { Metadata } from "next";
import { supabase } from "@/ClientConstants";
import PublicPrototypePage from "./PublicPrototypePage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ prototype_id: string }>;
}): Promise<Metadata> {
  const { prototype_id } = await params;
  const { data: prototype } = await supabase
    .from("prototypes")
    .select("name")
    .eq("id", prototype_id)
    .single();

  return {
    title: prototype?.name ? `${prototype.name} | Nucleate` : "Nucleate",
  };
}

export default function PublicPrototypePageContainer() {
  return <PublicPrototypePage />;
}
