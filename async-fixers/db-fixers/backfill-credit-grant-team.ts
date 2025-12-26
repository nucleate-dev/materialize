/**
 * Fixer that ensures every credit_grants row is associated with a team.
 * Rows with NULL team_id will be backfilled using the grant owner's personal team.
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type CreditGrantRow = Database["public"]["Tables"]["credit_grants"]["Row"];

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
      `[credit-grant-team-fixer] Failed to fetch personal team for user ${userId}: ${error.message}`,
    );
  }

  if (!data?.id) {
    throw new Error(
      `[credit-grant-team-fixer] No personal team found for user ${userId}`,
    );
  }

  return data.id;
}

export const fixer: NucleateDBFixer<"credit_grants"> = {
  table: "credit_grants",
  orderByColumn: "created_at",

  genIsInconsistent(row) {
    return !row.team_id;
  },

  async genFixRow(row: CreditGrantRow) {
    const teamId = await getPersonalTeamId(row.user_id);
    console.log(
      `[credit-grant-team-fixer] Backfilling team ${teamId} for credit grant ${row.id}`,
    );

    return {
      ...row,
      team_id: teamId,
    };
  },
};

export default fixer;
