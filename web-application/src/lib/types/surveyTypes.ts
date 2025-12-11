// Survey response types for user onboarding

export type UseCase =
  | "personal_project"
  | "client_prototype"
  | "exploring_ai_tools"
  | "learning_development"
  | "startup_business"
  | "other";

export type Role =
  | "founder_entrepreneur"
  | "product_designer"
  | "software_engineer"
  | "product_manager"
  | "student"
  | "hobbyist"
  | "other";

export type AICodingExperience =
  | "never_used"
  | "tried_few_times"
  | "regular_user"
  | "power_user";

export type ReferralSource =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "friend_family"
  | "search_engine"
  | "other";

export interface SurveyResponses {
  useCases: UseCase[]; // Multi-select
  useCasesOther?: string;
  role: Role; // Single select
  roleOther?: string;
  aiCodingExperience: AICodingExperience; // Single select
  referralSource: ReferralSource; // Single select
  referralSourceOther?: string;
}

export interface UserOnboardingSurvey extends SurveyResponses {
  userId: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyOption {
  value: string;
  label: string;
  icon: string; // Lucide icon name
  allowText?: boolean; // If true, show text input when selected
}

export interface SurveyQuestion {
  id: keyof SurveyResponses;
  title: string;
  subtitle?: string;
  type: "single-select" | "multi-select";
  options: SurveyOption[];
}

export interface SurveyStatus {
  completed: boolean;
  completedAt?: string;
}
