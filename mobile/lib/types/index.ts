export * from './ChatTypes';
export * from './serverAPITypes';

// Prototype type for display in the app
export interface Prototype {
  id: string;
  name: string;
  description: string | null;
  screenshot_url: string | null;
  framework: 'mobile_expo_react_native' | 'web_nextjs_react';
  visibility: 'PUBLIC' | 'TEAM' | 'SELF';
  design_style: string | null;
  team_id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Team type
export interface Team {
  id: string;
  name: string;
  avatar_url: string | null;
  is_personal: boolean;
  created_at: string;
}

// Team member type
export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

// User profile type
export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

// Subscription type
export interface Subscription {
  id: string;
  team_id: string;
  plan: 'free' | 'plus' | 'pro' | 'max' | 'team';
  status: 'active' | 'canceled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  credits_used: number;
  credits_limit: number;
}
