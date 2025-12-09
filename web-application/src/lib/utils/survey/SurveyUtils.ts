import { supabase } from "@/ClientConstants";
import type { SurveyResponses, SurveyStatus } from "@/lib/types/surveyTypes";

/**
 * Check if user has completed the onboarding survey
 */
export async function checkSurveyCompleted(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_onboarding_survey")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      console.error("Error checking survey status:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Error checking survey status:", error);
    return false;
  }
}

/**
 * Submit user survey responses
 */
export async function submitSurvey(
  userId: string,
  responses: SurveyResponses
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if survey already exists
    const { data: existing } = await supabase
      .from("user_onboarding_survey")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      // Update existing survey
      const { error } = await supabase
        .from("user_onboarding_survey")
        .update({
          use_cases: responses.useCases,
          use_cases_other: responses.useCasesOther || null,
          role: responses.role,
          role_other: responses.roleOther || null,
          ai_coding_experience: responses.aiCodingExperience,
          referral_source: responses.referralSource,
          referral_source_other: responses.referralSourceOther || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        console.error("Error updating survey:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    } else {
      // Insert new survey
      const { error } = await supabase
        .from("user_onboarding_survey")
        .insert({
          user_id: userId,
          use_cases: responses.useCases,
          use_cases_other: responses.useCasesOther || null,
          role: responses.role,
          role_other: responses.roleOther || null,
          ai_coding_experience: responses.aiCodingExperience,
          referral_source: responses.referralSource,
          referral_source_other: responses.referralSourceOther || null,
        });

      if (error) {
        console.error("Error inserting survey:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error submitting survey:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Save survey progress to localStorage
 */
export function saveSurveyProgress(
  step: number,
  responses: Partial<SurveyResponses>
): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      "survey_progress",
      JSON.stringify({
        step,
        responses,
        savedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Failed to save survey progress:", error);
  }
}

/**
 * Load survey progress from localStorage
 */
export function loadSurveyProgress(): {
  step: number;
  responses: Partial<SurveyResponses>;
} | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem("survey_progress");
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const savedAt = new Date(parsed.savedAt);
    const now = new Date();

    // Expire progress after 24 hours
    if (now.getTime() - savedAt.getTime() > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("survey_progress");
      return null;
    }

    return {
      step: parsed.step,
      responses: parsed.responses,
    };
  } catch (error) {
    console.error("Failed to load survey progress:", error);
    return null;
  }
}

/**
 * Clear survey progress from localStorage
 */
export function clearSurveyProgress(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem("survey_progress");
  } catch (error) {
    console.error("Failed to clear survey progress:", error);
  }
}
