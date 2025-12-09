"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/ClientConstants";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { SurveyResponses } from "@/lib/types/surveyTypes";
import { SURVEY_QUESTIONS } from "@/lib/utils/survey/surveyQuestions";
import {
  submitSurvey,
  checkSurveyCompleted,
} from "@/lib/utils/survey/SurveyUtils";
import { SurveyHeader } from "@/app/(callbacks)/welcome-survey/components/SurveyHeader";
import { QuestionCard } from "@/app/(callbacks)/welcome-survey/components/QuestionCard";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { posthogClient } from "@/ClientConstants";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SurveyOverlayProps {
  userId: string;
  isBuildRunning: boolean; // Trigger survey when build is running
}

export function SurveyOverlay({ userId, isBuildRunning }: SurveyOverlayProps) {
  const router = useRouter();
  const logger = useProductLogger();
  const [showSurvey, setShowSurvey] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
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

  // Check if survey is completed and show if build is running
  useEffect(() => {
    async function checkAndShowSurvey() {
      if (hasChecked || !isBuildRunning || !userId) return;

      try {
        const completed = await checkSurveyCompleted(userId);
        if (!completed) {
          setShowSurvey(true);
        }
        setHasChecked(true);
      } catch (error) {
        logger.debug("error", "Error checking survey status", {
          error: error instanceof Error ? error.message : String(error),
        });
        setHasChecked(true);
      }
    }

    checkAndShowSurvey();
  }, [isBuildRunning, userId, hasChecked, logger]);

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

      const result = await submitSurvey(userId, finalResponses);

      if (result.success) {
        if (
          posthogClient &&
          typeof posthogClient === "object" &&
          "capture" in posthogClient
        ) {
          (
            posthogClient as { capture: (event: string, props: object) => void }
          ).capture("survey_completed", {
            user_id: userId,
            context: "build_overlay",
            answers: finalResponses,
          });
        }

        setShowSurvey(false);
      } else {
        logger.debug("error", "Failed to submit survey", {
          error: result.error,
        });
        setShowSurvey(false);
      }
    } catch (error) {
      logger.debug("error", "Error submitting survey", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      setShowSurvey(false);
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

  const canContinue = () => {
    const questionId = currentQuestion.id;
    const value = responses[questionId];

    if (currentQuestion.type === "multi-select") {
      const arr = value as string[] | undefined;
      if (!arr || arr.length === 0) return false;
      if (arr.includes("other")) {
        const otherKey = `${questionId}Other` as keyof typeof otherTexts;
        return otherTexts[otherKey].trim().length > 0;
      }
      return true;
    } else {
      if (!value) return false;
      if (value === "other") {
        const otherKey = `${questionId}Other` as keyof typeof otherTexts;
        return otherTexts[otherKey].trim().length > 0;
      }
      return true;
    }
  };

  const currentValue =
    responses[currentQuestion.id] ||
    (currentQuestion.type === "multi-select" ? [] : "");
  const otherKey = `${currentQuestion.id}Other` as keyof typeof otherTexts;
  const otherText = otherTexts[otherKey] || "";

  if (!showSurvey) return null;

  return (
    <Dialog open={showSurvey} onOpenChange={(open) => !isSubmitting && setShowSurvey(open)}>
      <DialogContent className="max-w-md p-0 bg-white rounded-3xl border-4 border-slate-900 shadow-2xl overflow-hidden h-[90vh] max-h-[800px] flex flex-col">
        {/* Dismiss button */}
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSurvey(false)}
            className="h-8 w-8 rounded-full hover:bg-slate-100"
            disabled={isSubmitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
