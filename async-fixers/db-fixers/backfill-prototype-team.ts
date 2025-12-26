/**
 * Fixer that ensures every prototype points at its owner's personal team.
 * A prototype row is considered inconsistent when `team_id` is null.
 * When encountered, we look up the owner's personal team and set that team id.
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type PrototypeRow = Database["public"]["Tables"]["prototypes"]["Row"];

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getPersonalTeamId(ownerId: string): Promise<string> {
  const { data, error } = await supabase
    .from("teams")
    .select("id")
    .eq("personal_owner_user_id", ownerId)
    .single();

  if (error) {
    throw new Error(
      `[prototype-team-fixer] Failed to fetch personal team for owner ${ownerId}: ${error.message}`,
    );
  }

  if (!data?.id) {
    throw new Error(
      `[prototype-team-fixer] No personal team found for owner ${ownerId}`,
    );
  }

  return data.id;
}

export const fixer: NucleateDBFixer<"prototypes"> = {
  table: "prototypes",
  orderByColumn: "created_at",

  genIsInconsistent(row) {
    return !row.team_id;
  },

  async genFixRow(row: PrototypeRow) {
    if (!row.owner_id) {
      throw new Error(
        `[prototype-team-fixer] Prototype ${row.id} has no owner_id, cannot backfill team`,
      );
    }

    const teamId = await getPersonalTeamId(row.owner_id);
    console.log(
      `[prototype-team-fixer] Setting team ${teamId} for prototype ${row.id}`,
    );

    return {
      ...row,
      team_id: teamId,
    };
  },
};

export default fixer;
