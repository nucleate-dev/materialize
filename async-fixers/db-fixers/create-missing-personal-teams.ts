/**
 * Fixer that ensures every user has a personal team and owner membership.
 *
 * A user row is inconsistent when there is no team whose
 * `personal_owner_user_id` matches the user's id. The fixer recreates the
 * automatic behavior from the `handle_new_user` trigger by inserting a team
 * record and an owner membership for the affected user.
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function buildPersonalTeamName(user: UserRow): string {
  const trimmedName = user.name?.trim();
  if (trimmedName) {
    const firstName = trimmedName.split(/\s+/)[0];
    if (firstName.length > 0) {
      return `${firstName}'s Team`;
    }
  }

  const emailPrefix = user.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return `${emailPrefix}'s Team`;
  }

  return "My Team";
}

export const fixer: NucleateDBFixer<"users"> = {
  table: "users",
  orderByColumn: "created_at",

  async genIsInconsistent(user) {
    const { data, error } = await supabase
      .from("teams")
      .select("id")
      .eq("personal_owner_user_id", user.id)
      .limit(1);

    if (error) {
      throw new Error(
        `[missing-personal-team] Failed to check personal team for user ${user.id}: ${error.message}`,
      );
    }

    return (data ?? []).length === 0;
  },

  async genFixRow(user) {
    const teamName = buildPersonalTeamName(user);
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: teamName,
        created_by: user.id,
        personal_owner_user_id: user.id,
      })
      .select("id")
      .single();

    if (teamError) {
      throw new Error(
        `[missing-personal-team] Failed to create team for user ${user.id}: ${teamError.message}`,
      );
    }

    const { error: membershipError } = await supabase
      .from("team_memberships")
      .upsert(
        {
          team_id: team.id,
          user_id: user.id,
          role: "owner",
        },
        { onConflict: "team_id,user_id" },
      );

    if (membershipError) {
      throw new Error(
        `[missing-personal-team] Failed to add owner membership for user ${user.id}: ${membershipError.message}`,
      );
    }

    console.log(
      `[missing-personal-team] Created personal team ${team.id} for user ${user.id}`,
    );

    return user;
  },
};

export default fixer;
