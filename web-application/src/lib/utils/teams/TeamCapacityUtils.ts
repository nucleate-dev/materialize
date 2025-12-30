import { Database } from "@/lib/types/supabase";

type TeamRole = Database["public"]["Enums"]["team_role"];
type SubscriptionPlanType =
  Database["public"]["Enums"]["subscription_plan_type"];

interface TeamMember {
  role: TeamRole;
}

interface TeamInvite {
  role: TeamRole;
  invite_status?: string | null;
}

interface TeamCapacityCheckParams {
  plan: SubscriptionPlanType;
  teamMembers: TeamMember[];
  teamInvites: TeamInvite[];
  seatQuantity: number | null;
  inviteRole: TeamRole;
}

interface TeamCapacityResult {
  canInvite: boolean;
  canChangeRoles: boolean;
  shouldShowUpsell: boolean;
  shouldShowCapacityAlert: boolean;
  reason?:
    | "free_tier_no_invites"
    | "plus_at_capacity"
    | "team_at_capacity"
    | "allowed";
}

/**
 * Checks if a team can invite new members based on their subscription plan and current capacity
 *
 * @param params - Team capacity check parameters
 * @returns TeamCapacityResult with invitation permissions and UI flags
 */
export function checkTeamCapacity(
  params: TeamCapacityCheckParams,
): TeamCapacityResult {
  const { plan, teamMembers, teamInvites, seatQuantity, inviteRole } = params;

  // Filter out canceled invites
  const activeInvites = teamInvites.filter(
    (invite) => invite.invite_status !== "canceled",
  );

  // FREE PLAN: No users can be added, roles cannot be changed
  if (plan === "free") {
    return {
      canInvite: false,
      canChangeRoles: false,
      shouldShowUpsell: true,
      shouldShowCapacityAlert: false,
      reason: "free_tier_no_invites",
    };
  }

  // PLUS PLAN: Total members + pending invites must be < 2
  if (plan === "plus") {
    const totalMembers = teamMembers.length + activeInvites.length;
    const canInvite = totalMembers < 2;

    return {
      canInvite,
      canChangeRoles: true,
      shouldShowUpsell: !canInvite,
      shouldShowCapacityAlert: false,
      reason: canInvite ? "allowed" : "plus_at_capacity",
    };
  }

  // TEAM PLAN: Viewers can always be added, collaborators limited by seat_quantity
  if (plan === "team") {
    // Viewers can ALWAYS be added
    if (inviteRole === "viewer") {
      return {
        canInvite: true,
        canChangeRoles: true,
        shouldShowUpsell: false,
        shouldShowCapacityAlert: false,
        reason: "allowed",
      };
    }

    // For collaborators (owner/admin/editor), check seat capacity
    if (seatQuantity === null) {
      // If seat quantity is not set, allow invites (shouldn't happen but handle gracefully)
      return {
        canInvite: true,
        canChangeRoles: true,
        shouldShowUpsell: false,
        shouldShowCapacityAlert: false,
        reason: "allowed",
      };
    }

    // Count non-viewer members and pending invites
    const nonViewerMembers = teamMembers.filter(
      (member) => member.role !== "viewer",
    );
    const nonViewerInvites = activeInvites.filter(
      (invite) => invite.role !== "viewer",
    );
    const totalNonViewers = nonViewerMembers.length + nonViewerInvites.length;

    const canInvite = totalNonViewers < seatQuantity;

    return {
      canInvite,
      canChangeRoles: true,
      shouldShowUpsell: false,
      shouldShowCapacityAlert: !canInvite,
      reason: canInvite ? "allowed" : "team_at_capacity",
    };
  }

  // PRO/MAX PLANS: No restrictions (treat like team plan with unlimited seats)
  return {
    canInvite: true,
    canChangeRoles: true,
    shouldShowUpsell: false,
    shouldShowCapacityAlert: false,
    reason: "allowed",
  };
}

/**
 * Helper to check if a team can change member roles based on subscription plan
 *
 * @param plan - Current subscription plan
 * @returns boolean indicating if roles can be changed
 */
export function canChangeTeamMemberRoles(
  plan: SubscriptionPlanType,
): boolean {
  return plan !== "free";
}

interface RoleChangeCheckParams {
  plan: SubscriptionPlanType;
  currentRole: TeamRole;
  newRole: TeamRole;
  teamMembers: TeamMember[];
  teamInvites: TeamInvite[];
  seatQuantity: number | null;
}

/**
 * Checks if a specific role change is allowed based on subscription plan and capacity
 *
 * @param params - Role change check parameters
 * @returns boolean indicating if the role change is allowed
 */
export function canChangeRole(params: RoleChangeCheckParams): boolean {
  const { plan, currentRole, newRole, teamMembers, teamInvites, seatQuantity } =
    params;

  // FREE PLAN: No role changes allowed
  if (plan === "free") {
    return false;
  }

  // PLUS/PRO/MAX PLANS: All role changes allowed
  if (plan !== "team") {
    return true;
  }

  // TEAM PLAN: Special logic
  // Changing TO viewer is always allowed (frees up a seat)
  if (newRole === "viewer") {
    return true;
  }

  // If both current and new roles are non-viewer, allow (just changing between collaborator roles)
  if (currentRole !== "viewer") {
    return true;
  }

  // Changing FROM viewer TO collaborator role - check capacity
  // At this point we know: currentRole === "viewer" && newRole !== "viewer"
  if (seatQuantity === null) {
    // If seat quantity is not set, allow (shouldn't happen but handle gracefully)
    return true;
  }

  // Filter out canceled invites
  const activeInvites = teamInvites.filter(
    (invite) => invite.invite_status !== "canceled",
  );

  // Count non-viewer members and pending invites
  const nonViewerMembers = teamMembers.filter(
    (member) => member.role !== "viewer",
  );
  const nonViewerInvites = activeInvites.filter(
    (invite) => invite.role !== "viewer",
  );
  const totalNonViewers = nonViewerMembers.length + nonViewerInvites.length;

  // Allow if we have capacity (the person being promoted is already counted as a viewer)
  return totalNonViewers < seatQuantity;
}
