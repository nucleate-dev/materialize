import { Database } from "@/lib/types/supabase";

export type Prototype = Database["public"]["Tables"]["prototypes"]["Row"] & {
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};
