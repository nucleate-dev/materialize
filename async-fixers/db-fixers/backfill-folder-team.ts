/**
 * Fixer that ensures every folder points at its owner's personal team.
 * A folder row is considered inconsistent when `team_id` is null.
 * When encountered, we look up the owner's personal team and set that team id.
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type FolderRow = Database["public"]["Tables"]["folders"]["Row"];

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
      `[folder-team-fixer] Failed to fetch personal team for owner ${ownerId}: ${error.message}`,
    );
  }

  if (!data?.id) {
    throw new Error(
      `[folder-team-fixer] No personal team found for owner ${ownerId}`,
    );
  }

  return data.id;
}

export const fixer: NucleateDBFixer<"folders"> = {
  table: "folders",
  orderByColumn: "created_at",

  genIsInconsistent(row) {
    return !row.team_id;
  },

  async genFixRow(row: FolderRow) {
    if (!row.owner_id) {
      throw new Error(
        `[folder-team-fixer] Folder ${row.id} has no owner_id, cannot backfill team`,
      );
    }

    const teamId = await getPersonalTeamId(row.owner_id);
    console.log(
      `[folder-team-fixer] Setting team ${teamId} for folder ${row.id}`,
    );

    return {
      ...row,
      team_id: teamId,
    };
  },
};

export default fixer;
