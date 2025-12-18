"use client";

import { QuestionCard } from "@/app/(callbacks)/welcome-survey/components/QuestionCard";
import { SurveyHeader } from "@/app/(callbacks)/welcome-survey/components/SurveyHeader";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type { SurveyResponses } from "@/lib/types/surveyTypes";
import { SURVEY_QUESTIONS } from "@/lib/utils/survey/surveyQuestions";
import {
  checkSurveyCompleted,
  submitSurvey,
} from "@/lib/utils/survey/SurveyUtils";
import { useEffect, useState } from "react";
import { usePostHog } from "posthog-js/react";

interface SurveyOverlayProps {
  userId: string;
  isBuildRunning: boolean; // Trigger survey when build is running
}

export function SurveyOverlay({ userId, isBuildRunning }: SurveyOverlayProps) {
  const logger = useProductLogger();
  const posthog = usePostHog();
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
        posthog?.capture("survey_completed", {
          user_id: userId,
          context: "build_overlay",
          answers: finalResponses,
        });

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
    <Dialog open={showSurvey} onOpenChange={() => { }}>
      <DialogContent
        className="max-w-lg p-0 bg-[#141517] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col gap-0"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >

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
          isSubmitting={isSubmitting}
          isLastStep={currentStep === totalSteps}
        />
      </DialogContent>
    </Dialog>
  );
}
