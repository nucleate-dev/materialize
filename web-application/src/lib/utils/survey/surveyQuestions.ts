import type { SurveyQuestion } from "@/lib/types/surveyTypes";

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "useCases",
    title: "What are you using Nucleate for?",
    subtitle: "Select all that apply",
    type: "multi-select",
    options: [
      {
        value: "personal_project",
        label: "Personal project",
        icon: "User",
      },
      {
        value: "client_prototype",
        label: "Client prototype",
        icon: "Briefcase",
      },
      {
        value: "exploring_ai_tools",
        label: "Exploring AI tools",
        icon: "Sparkles",
      },
      {
        value: "learning_development",
        label: "Learning development",
        icon: "GraduationCap",
      },
      {
        value: "startup_business",
        label: "Startup/business",
        icon: "Rocket",
      },
      {
        value: "other",
        label: "Other",
        icon: "MoreHorizontal",
        allowText: true,
      },
    ],
  },
  {
    id: "role",
    title: "What is your role?",
    type: "single-select",
    options: [
      {
        value: "founder_entrepreneur",
        label: "Founder / Entrepreneur",
        icon: "Target",
      },
      {
        value: "product_designer",
        label: "Product Designer",
        icon: "Palette",
      },
      {
        value: "software_engineer",
        label: "Software Engineer",
        icon: "Code",
      },
      {
        value: "product_manager",
        label: "Product Manager",
        icon: "ClipboardList",
      },
      {
        value: "student",
        label: "Student",
        icon: "BookOpen",
      },
      {
        value: "hobbyist",
        label: "Hobbyist / Explorer",
        icon: "Compass",
      },
      {
        value: "other",
        label: "Other",
        icon: "MoreHorizontal",
        allowText: true,
      },
    ],
  },
  {
    id: "aiCodingExperience",
    title: "Experience with AI coding tools?",
    type: "single-select",
    options: [
      {
        value: "never_used",
        label: "Never used",
        icon: "X",
      },
      {
        value: "tried_few_times",
        label: "Tried a few times",
        icon: "Eye",
      },
      {
        value: "regular_user",
        label: "Use regularly",
        icon: "Check",
      },
      {
        value: "power_user",
        label: "Power user",
        icon: "Zap",
      },
    ],
  },
  {
    id: "referralSource",
    title: "Where did you hear about Nucleate?",
    type: "single-select",
    options: [
      {
        value: "newsletter",
        label: "Newsletter",
        icon: "Mail",
      },
      {
        value: "friend_family",
        label: "Friend or family",
        icon: "Users",
      },
      {
        value: "search_engine",
        label: "Google",
        icon: "Search",
      },
      {
        value: "ai_recommendation",
        label: "AI (ChatGPT, Gemini, Claude)",
        icon: "Zap",
      },
      {
        value: "instagram",
        label: "Instagram",
        icon: "Camera",
      },
      {
        value: "tiktok",
        label: "TikTok",
        icon: "Music2",
      },
      {
        value: "linkedin",
        label: "LinkedIn",
        icon: "Link2",
      },
      {
        value: "youtube",
        label: "YouTube",
        icon: "Play",
      },
      {
        value: "twitter",
        label: "Twitter/X",
        icon: "Twitter",
      },
      {
        value: "other",
        label: "Other",
        icon: "MoreHorizontal",
        allowText: true,
      },
    ],
  },
];
