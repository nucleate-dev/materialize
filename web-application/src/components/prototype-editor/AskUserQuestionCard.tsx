"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/classNames";
import { Clock, MessageSquareMore, Send, X } from "lucide-react";

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface AskUserQuestionCardProps {
  toolCallId: string;
  questions: Question[];
  timeoutMs: number;
  onSubmit: (toolCallId: string, answers: Record<string, string>) => void;
  onCancel: (toolCallId: string) => void;
  disabled?: boolean;
}

export default function AskUserQuestionCard({
  toolCallId,
  questions,
  timeoutMs,
  onSubmit,
  onCancel,
  disabled = false,
}: AskUserQuestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(
    Math.floor(timeoutMs / 1000)
  );
  const [isSubmitted, setIsSubmitted] = useState(false);

  const buildFinalAnswers = useCallback(() => {
    const finalAnswers: Record<string, string> = {};
    for (const q of questions) {
      const answer = answers[q.question];
      if (Array.isArray(answer)) {
        // Multi-select: join with ", "
        const selected = answer.map((a) =>
          a === "Other" && otherInputs[q.question]
            ? otherInputs[q.question]
            : a
        );
        finalAnswers[q.question] = selected.join(", ");
      } else if (answer === "Other" && otherInputs[q.question]) {
        finalAnswers[q.question] = otherInputs[q.question];
      } else {
        finalAnswers[q.question] = answer || q.options[0]?.label || "";
      }
    }
    return finalAnswers;
  }, [answers, otherInputs, questions]);

  const handleSubmit = useCallback(() => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onSubmit(toolCallId, buildFinalAnswers());
  }, [buildFinalAnswers, isSubmitted, onSubmit, toolCallId]);

  // Countdown timer
  useEffect(() => {
    if (isSubmitted || disabled) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-submit with current answers or defaults
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSubmitted, disabled, handleSubmit]);

  const handleSingleSelect = useCallback(
    (questionText: string, value: string) => {
      setAnswers((prev) => ({
        ...prev,
        [questionText]: value,
      }));
    },
    []
  );

  const handleMultiSelect = useCallback(
    (questionText: string, value: string, checked: boolean) => {
      setAnswers((prev) => {
        const current = (prev[questionText] as string[]) || [];
        if (checked) {
          return { ...prev, [questionText]: [...current, value] };
        } else {
          return { ...prev, [questionText]: current.filter((v) => v !== value) };
        }
      });
    },
    []
  );

  const handleOtherInput = useCallback(
    (questionText: string, value: string) => {
      setOtherInputs((prev) => ({
        ...prev,
        [questionText]: value,
      }));
    },
    []
  );

  const handleCancel = useCallback(() => {
    setIsSubmitted(true);
    onCancel(toolCallId);
  }, [toolCallId, onCancel]);

  const isComplete = questions.every((q) => {
    const answer = answers[q.question];
    if (q.multiSelect) {
      return Array.isArray(answer) && answer.length > 0;
    }
    return !!answer;
  });

  return (
    <div
      className={cn(
        "w-full max-w-lg rounded-xl border-2 border-primary/30 bg-card text-card-foreground p-4 shadow-sm",
        isSubmitted && "opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <MessageSquareMore className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-card-foreground">
            Claude needs your input
          </span>
        </div>
        {!isSubmitted && (
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
              timeRemaining <= 10
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Clock className="w-3 h-3" />
            <span>{timeRemaining}s</span>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="space-y-2.5">
            {q.header && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {q.header}
              </div>
            )}
            <div className="text-sm font-medium text-card-foreground">
              {q.question}
            </div>

            {q.multiSelect ? (
              // Multi-select: Checkboxes
              <div className="space-y-2">
                {q.options.map((opt, optIndex) => (
                  <div
                    key={optIndex}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                      (answers[q.question] as string[] || []).includes(opt.label)
                        ? "border-primary/50 bg-primary/10"
                        : "border-border hover:bg-accent/50",
                      (isSubmitted || disabled) && "pointer-events-none"
                    )}
                    onClick={() =>
                      !isSubmitted &&
                      !disabled &&
                      handleMultiSelect(
                        q.question,
                        opt.label,
                        !(answers[q.question] as string[] || []).includes(
                          opt.label
                        )
                      )
                    }
                  >
                    <Checkbox
                      id={`${qIndex}-${optIndex}`}
                      checked={(answers[q.question] as string[] || []).includes(
                        opt.label
                      )}
                      onCheckedChange={(checked) =>
                        handleMultiSelect(
                          q.question,
                          opt.label,
                          checked as boolean
                        )
                      }
                      disabled={isSubmitted || disabled}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col flex-1">
                      <Label
                        htmlFor={`${qIndex}-${optIndex}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {opt.label}
                      </Label>
                      {opt.description && (
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Other option for multi-select */}
                <div
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                    (answers[q.question] as string[] || []).includes("Other")
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/50",
                    (isSubmitted || disabled) && "pointer-events-none"
                  )}
                  onClick={() =>
                    !isSubmitted &&
                    !disabled &&
                    handleMultiSelect(
                      q.question,
                      "Other",
                      !(answers[q.question] as string[] || []).includes("Other")
                    )
                  }
                >
                  <Checkbox
                    id={`${qIndex}-other`}
                    checked={(answers[q.question] as string[] || []).includes(
                      "Other"
                    )}
                    onCheckedChange={(checked) =>
                      handleMultiSelect(q.question, "Other", checked as boolean)
                    }
                    disabled={isSubmitted || disabled}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col flex-1">
                    <Label
                      htmlFor={`${qIndex}-other`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      Other
                    </Label>
                    {(answers[q.question] as string[] || []).includes(
                      "Other"
                    ) && (
                      <Input
                        placeholder="Enter your answer..."
                        value={otherInputs[q.question] || ""}
                        onChange={(e) =>
                          handleOtherInput(q.question, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 h-8 text-sm"
                        disabled={isSubmitted || disabled}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Single-select: RadioGroup
              <RadioGroup
                value={(answers[q.question] as string) || ""}
                onValueChange={(value) => handleSingleSelect(q.question, value)}
                disabled={isSubmitted || disabled}
                className="space-y-2"
              >
                {q.options.map((opt, optIndex) => (
                  <div
                    key={optIndex}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                      answers[q.question] === opt.label
                        ? "border-primary/50 bg-primary/10"
                        : "border-border hover:bg-accent/50",
                      (isSubmitted || disabled) && "pointer-events-none"
                    )}
                    onClick={() =>
                      !isSubmitted &&
                      !disabled &&
                      handleSingleSelect(q.question, opt.label)
                    }
                  >
                    <RadioGroupItem
                      value={opt.label}
                      id={`${qIndex}-${optIndex}`}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col flex-1">
                      <Label
                        htmlFor={`${qIndex}-${optIndex}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {opt.label}
                      </Label>
                      {opt.description && (
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Other option for single-select */}
                <div
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                    answers[q.question] === "Other"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/50",
                    (isSubmitted || disabled) && "pointer-events-none"
                  )}
                  onClick={() =>
                    !isSubmitted &&
                    !disabled &&
                    handleSingleSelect(q.question, "Other")
                  }
                >
                  <RadioGroupItem
                    value="Other"
                    id={`${qIndex}-other`}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col flex-1">
                    <Label
                      htmlFor={`${qIndex}-other`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      Other
                    </Label>
                    {answers[q.question] === "Other" && (
                      <Input
                        placeholder="Enter your answer..."
                        value={otherInputs[q.question] || ""}
                        onChange={(e) =>
                          handleOtherInput(q.question, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 h-8 text-sm"
                        disabled={isSubmitted || disabled}
                      />
                    )}
                  </div>
                </div>
              </RadioGroup>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      {!isSubmitted && (
        <div className="flex gap-2 mt-5">
          <Button
            onClick={handleSubmit}
            disabled={!isComplete || disabled}
            className="flex-1"
            size="sm"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit
          </Button>
          <Button
            onClick={handleCancel}
            variant="secondary"
            size="sm"
            disabled={disabled}
          >
            <X className="w-4 h-4 mr-2" />
            Skip
          </Button>
        </div>
      )}

      {/* Submitted state */}
      {isSubmitted && (
        <div className="text-xs text-muted-foreground text-center mt-4">
          Response submitted
        </div>
      )}
    </div>
  );
}
