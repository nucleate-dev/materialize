"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/ClientConstants";
import type { SurveyResponses } from "@/lib/types/surveyTypes";
import { SURVEY_QUESTIONS } from "@/lib/utils/survey/surveyQuestions";
import {
  submitSurvey,
  saveSurveyProgress,
  loadSurveyProgress,
  clearSurveyProgress,
} from "@/lib/utils/survey/SurveyUtils";
import { SurveyHeader } from "./components/SurveyHeader";
import { QuestionCard } from "./components/QuestionCard";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { posthogClient } from "@/ClientConstants";

export function WelcomeSurveyFlow() {
  const router = useRouter();
  const logger = useProductLogger();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responses, setResponses] = useState<Partial<SurveyResponses>>({
    useCases: [],
    role: undefined,
    aiCodingExperience: undefined,
    referralSource: undefined,
  });

  const [otherTexts, setOtherTexts] = useState({
    useCasesOther: "",
    roleOther: "",
    referralSourceOther: "",
  });

  // Load saved progress on mount
  useEffect(() => {
    const saved = loadSurveyProgress();
    if (saved) {
      setCurrentStep(saved.step);
      setResponses(saved.responses);
      // Extract other texts from responses
      if (saved.responses.useCasesOther) {
        setOtherTexts((prev) => ({
          ...prev,
          useCasesOther: saved.responses.useCasesOther!,
        }));
      }
      if (saved.responses.roleOther) {
        setOtherTexts((prev) => ({
          ...prev,
          roleOther: saved.responses.roleOther!,
        }));
      }
      if (saved.responses.referralSourceOther) {
        setOtherTexts((prev) => ({
          ...prev,
          referralSourceOther: saved.responses.referralSourceOther!,
        }));
      }
    }
  }, []);

  // Save progress whenever it changes
  useEffect(() => {
    saveSurveyProgress(currentStep, {
      ...responses,
      ...otherTexts,
    });
  }, [currentStep, responses, otherTexts]);

  const currentQuestion = SURVEY_QUESTIONS[currentStep - 1];
  const totalSteps = SURVEY_QUESTIONS.length;

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Get access token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        logger.debug("error", "No access token available for survey submission");
        router.push("/login");
        return;
      }

      // Prepare final responses
      const finalResponses: SurveyResponses = {
        useCases: responses.useCases || [],
        role: responses.role!,
        aiCodingExperience: responses.aiCodingExperience!,
        referralSource: responses.referralSource!,
        ...(responses.useCases?.includes("other") && {
          useCasesOther: otherTexts.useCasesOther,
        }),
        ...(responses.role === "other" && {
          roleOther: otherTexts.roleOther,
        }),
        ...(responses.referralSource === "other" && {
          referralSourceOther: otherTexts.referralSourceOther,
        }),
      };

      // Submit survey
      const result = await submitSurvey(session.user.id, finalResponses);

      if (result.success) {
        // Clear saved progress
        clearSurveyProgress();

        // Track analytics
        if (posthogClient && typeof posthogClient === "object" && "capture" in posthogClient) {
          (posthogClient as { capture: (event: string, props: object) => void }).capture(
            "survey_completed",
            {
              user_id: session.user.id,
              answers: finalResponses,
            }
          );
        }

        // Check for stored intents
        let redirectPath = "/dashboard";

        if (typeof window !== "undefined") {
          const chatIntent = localStorage.getItem("chat_intent");
          if (chatIntent) {
            try {
              const parsed = JSON.parse(chatIntent) as {
                prototype_id?: string;
                message: string;
              };
              if (parsed.prototype_id) {
                redirectPath = `/dashboard/projects/${parsed.prototype_id}`;
              }
            } catch (e) {
              logger.debug("error", "Failed to parse chat_intent", {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }

        router.push(redirectPath);
      } else {
        logger.debug("error", "Failed to submit survey", {
          error: result.error,
        });
        // Still allow user to continue
        router.push("/dashboard");
      }
    } catch (error) {
      logger.debug("error", "Error submitting survey", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Still allow user to continue
      router.push("/dashboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelect = (value: string | string[]) => {
    const questionId = currentQuestion.id;
    setResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleOtherTextChange = (text: string) => {
    const questionId = currentQuestion.id;
    const otherKey = `${questionId}Other` as keyof typeof otherTexts;
    setOtherTexts((prev) => ({
      ...prev,
      [otherKey]: text,
    }));
  };

  // Check if user can continue
  const canContinue = () => {
    const questionId = currentQuestion.id;
    const value = responses[questionId];

    if (currentQuestion.type === "multi-select") {
      const arr = value as string[] | undefined;
      if (!arr || arr.length === 0) return false;
      // If "other" is selected, require text input
      if (arr.includes("other")) {
        const otherKey = `${questionId}Other` as keyof typeof otherTexts;
        return otherTexts[otherKey].trim().length > 0;
      }
      return true;
    } else {
      if (!value) return false;
      // If "other" is selected, require text input
      if (value === "other") {
        const otherKey = `${questionId}Other` as keyof typeof otherTexts;
        return otherTexts[otherKey].trim().length > 0;
      }
      return true;
    }
  };

  const currentValue = responses[currentQuestion.id] || (currentQuestion.type === "multi-select" ? [] : "");
  const otherKey = `${currentQuestion.id}Other` as keyof typeof otherTexts;
  const otherText = otherTexts[otherKey] || "";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border-4 border-slate-900 shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[800px]">
        <SurveyHeader
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={handleBack}
          canGoBack={currentStep > 1 && !isSubmitting}
        />

        <QuestionCard
          question={currentQuestion}
          selectedValues={currentValue}
          otherText={otherText}
          onSelect={handleSelect}
          onOtherTextChange={handleOtherTextChange}
          onContinue={handleNext}
          canContinue={canContinue() && !isSubmitting}
        />
      </div>
    </div>
  );
}
