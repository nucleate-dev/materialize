export const SUBSCRIPTION_ACCESS_QUERY_KEY = "subscription-access";

export const subscriptionAccessQueryKey = (teamId?: string | null) => [
  SUBSCRIPTION_ACCESS_QUERY_KEY,
  teamId ?? "anonymous",
];

export const CUSTOM_USER_ROW_QUERY_KEY = "custom-user-row";

export const customUserRowQueryKey = (userId?: string | null) => [
  CUSTOM_USER_ROW_QUERY_KEY,
  userId ?? "anonymous",
];

export const PERSONAL_TEAM_QUERY_KEY = "personal-team";

export const personalTeamQueryKey = (userId?: string | null) => [
  PERSONAL_TEAM_QUERY_KEY,
  userId ?? "anonymous",
];

export const CURRENT_USER_MEMBERSHIP_QUERY_KEY = "current-user-membership";

export const currentUserMembershipQueryKey = (
  userId?: string | null,
  teamId?: string | null
) => [
  CURRENT_USER_MEMBERSHIP_QUERY_KEY,
  userId ?? "anonymous",
  teamId ?? "no-team",
];

export const TEAM_MEMBERS_QUERY_KEY = "team-members";

export const teamMembersQueryKey = (teamId?: string | null) => [
  TEAM_MEMBERS_QUERY_KEY,
  teamId ?? "no-team",
];

export const TEAM_INVITES_QUERY_KEY = "team-invites";

export const teamInvitesQueryKey = (teamId?: string | null) => [
  TEAM_INVITES_QUERY_KEY,
  teamId ?? "no-team",
];
