import { Metadata } from "next";
import { supabase } from "@/ClientConstants";
import PublicPrototypePage from "./PublicPrototypePage";

export async function generateMetadata({
  params,
}: {
  params: { prototype_id: string };
}): Promise<Metadata> {
  const { data: prototype } = await supabase
    .from("prototypes")
    .select("name")
    .eq("id", params.prototype_id)
    .single();

  return {
    title: prototype?.name ? `${prototype.name} | Nucleate` : "Nucleate",
  };
}

export default function PublicPrototypePageContainer() {
  return <PublicPrototypePage />;
}
