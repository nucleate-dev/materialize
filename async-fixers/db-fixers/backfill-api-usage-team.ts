/**
 * Fixer that ensures every api_usage row carries a team_id.
 * Rows with NULL team_id are backfilled by looking up the user's personal team.
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type ApiUsageRow = Database["public"]["Tables"]["api_usage"]["Row"];
type ApiUsageUpdate = Database["public"]["Tables"]["api_usage"]["Update"];

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getPersonalTeamId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("teams")
    .select("id")
    .eq("personal_owner_user_id", userId)
    .single();

  if (error) {
    throw new Error(
      `[api-usage-team-fixer] Failed to fetch personal team for user ${userId}: ${error.message}`,
    );
  }

  if (!data?.id) {
    throw new Error(
      `[api-usage-team-fixer] No personal team found for user ${userId}`,
    );
  }

  return data.id;
}

export const fixer: NucleateDBFixer<"api_usage"> = {
  table: "api_usage",
  orderByColumn: "created_at",
  primaryKeyColumn: "id",
  writeBackMode: "update",

  genIsInconsistent(row) {
    return !row.team_id;
  },

  async genFixRow(row: ApiUsageRow) {
    const teamId = await getPersonalTeamId(row.user_id);
    console.log(
      `[api-usage-team-fixer] Backfilling team ${teamId} for api_usage row ${row.id}`,
    );

    const update: ApiUsageUpdate = {
      id: row.id,
      team_id: teamId,
    };

    return update as ApiUsageRow;
  },
};

export default fixer;
