"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/classNames";
import { Send, Sparkles } from "lucide-react";

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

  const progress = (questions.filter((q) => {
    const answer = answers[q.question];
    if (q.multiSelect) return Array.isArray(answer) && answer.length > 0;
    return !!answer;
  }).length / questions.length) * 100;

  return (
    <div
      className={cn(
        "w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm",
        isSubmitted && "opacity-60"
      )}
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Quick Question</span>
          <span className="text-xs text-muted-foreground">
            {Math.floor(progress)}% complete
          </span>
        </div>
        {!isSubmitted && (
          <span className="text-xs font-mono text-muted-foreground">
            {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4 h-1 bg-accent rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Questions - Compact Layout */}
      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="space-y-2">
            {q.header && (
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                {q.header}
              </div>
            )}
            <div className="text-sm font-medium text-foreground">{q.question}</div>

            {q.multiSelect ? (
              <div className="space-y-1.5">
                {q.options.map((opt, optIndex) => (
                  <div
                    key={optIndex}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded border transition-colors cursor-pointer text-sm",
                      (answers[q.question] as string[] || []).includes(opt.label)
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-accent",
                      (isSubmitted || disabled) && "pointer-events-none"
                    )}
                    onClick={() =>
                      !isSubmitted &&
                      !disabled &&
                      handleMultiSelect(
                        q.question,
                        opt.label,
                        !(answers[q.question] as string[] || []).includes(opt.label)
                      )
                    }
                  >
                    <Checkbox
                      id={`${qIndex}-${optIndex}`}
                      checked={(answers[q.question] as string[] || []).includes(opt.label)}
                      onCheckedChange={(checked) =>
                        handleMultiSelect(q.question, opt.label, checked as boolean)
                      }
                      disabled={isSubmitted || disabled}
                    />
                    <Label
                      htmlFor={`${qIndex}-${optIndex}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {opt.label}
                    </Label>
                  </div>
                ))}
                {/* Other */}
                <div
                  className={cn(
                    "flex items-center gap-2 p-2 rounded border transition-colors cursor-pointer text-sm",
                    (answers[q.question] as string[] || []).includes("Other")
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-accent",
                    (isSubmitted || disabled) && "pointer-events-none"
                  )}
                >
                  <Checkbox
                    id={`${qIndex}-other`}
                    checked={(answers[q.question] as string[] || []).includes("Other")}
                    onCheckedChange={(checked) =>
                      handleMultiSelect(q.question, "Other", checked as boolean)
                    }
                    disabled={isSubmitted || disabled}
                  />
                  <div className="flex-1">
                    <Label htmlFor={`${qIndex}-other`} className="text-sm cursor-pointer">
                      Other
                    </Label>
                    {(answers[q.question] as string[] || []).includes("Other") && (
                      <Input
                        placeholder="Specify..."
                        value={otherInputs[q.question] || ""}
                        onChange={(e) => handleOtherInput(q.question, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-7 text-xs"
                        disabled={isSubmitted || disabled}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <RadioGroup
                value={(answers[q.question] as string) || ""}
                onValueChange={(value) => handleSingleSelect(q.question, value)}
                disabled={isSubmitted || disabled}
                className="space-y-1.5"
              >
                {q.options.map((opt, optIndex) => (
                  <div
                    key={optIndex}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded border transition-colors cursor-pointer text-sm",
                      answers[q.question] === opt.label
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-accent",
                      (isSubmitted || disabled) && "pointer-events-none"
                    )}
                    onClick={() =>
                      !isSubmitted && !disabled && handleSingleSelect(q.question, opt.label)
                    }
                  >
                    <RadioGroupItem
                      value={opt.label}
                      id={`${qIndex}-${optIndex}`}
                    />
                    <Label
                      htmlFor={`${qIndex}-${optIndex}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {opt.label}
                    </Label>
                  </div>
                ))}
                {/* Other */}
                <div
                  className={cn(
                    "flex items-center gap-2 p-2 rounded border transition-colors cursor-pointer text-sm",
                    answers[q.question] === "Other"
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-accent",
                    (isSubmitted || disabled) && "pointer-events-none"
                  )}
                >
                  <RadioGroupItem value="Other" id={`${qIndex}-other`} />
                  <div className="flex-1">
                    <Label htmlFor={`${qIndex}-other`} className="text-sm cursor-pointer">
                      Other
                    </Label>
                    {answers[q.question] === "Other" && (
                      <Input
                        placeholder="Specify..."
                        value={otherInputs[q.question] || ""}
                        onChange={(e) => handleOtherInput(q.question, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-7 text-xs"
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

      {/* Compact Actions */}
      {!isSubmitted && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-border">
          <Button
            onClick={handleSubmit}
            disabled={!isComplete || disabled}
            className="flex-1 h-8"
            size="sm"
          >
            <Send className="w-3 h-3 mr-1.5" />
            Submit
          </Button>
          <Button onClick={handleCancel} variant="ghost" size="sm" disabled={disabled} className="h-8">
            Skip
          </Button>
        </div>
      )}

      {isSubmitted && (
        <div className="text-xs text-center text-muted-foreground mt-3 pt-3 border-t border-border">
          ✓ Response submitted
        </div>
      )}
    </div>
  );
}
