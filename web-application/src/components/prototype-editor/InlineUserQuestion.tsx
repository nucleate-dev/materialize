"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/classNames";
import { MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";

interface UserQuestionOption {
  label: string;
  description: string;
}

interface InlineUserQuestionProps {
  questionId: string;
  question: string;
  header: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
  isAnswered?: boolean; // For rendering historical questions
  answer?: string; // The previously submitted answer (for history)
  onSubmit?: (answer: string) => void; // Undefined for historical questions
}

export default function InlineUserQuestion({
  questionId,
  question,
  header,
  options,
  multiSelect,
  isAnswered = false,
  answer,
  onSubmit,
}: InlineUserQuestionProps) {
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  const handleSingleSelect = (value: string) => {
    if (value === "__other__") {
      setShowOtherInput(true);
      setSelectedValues(new Set(["__other__"]));
    } else {
      setShowOtherInput(false);
      setOtherText("");
      setSelectedValues(new Set([value]));
    }
  };

  const handleMultiSelect = (value: string, checked: boolean) => {
    const newSet = new Set(selectedValues);
    if (value === "__other__") {
      if (checked) {
        newSet.add("__other__");
        setShowOtherInput(true);
      } else {
        newSet.delete("__other__");
        setShowOtherInput(false);
        setOtherText("");
      }
    } else {
      if (checked) {
        newSet.add(value);
      } else {
        newSet.delete(value);
      }
    }
    setSelectedValues(newSet);
  };

  const handleSubmit = () => {
    if (!onSubmit) return;

    const selectedLabels: string[] = [];

    // Collect selected option labels
    for (const value of selectedValues) {
      if (value === "__other__") {
        if (otherText.trim()) {
          selectedLabels.push(otherText.trim());
        }
      } else {
        selectedLabels.push(value);
      }
    }

    // Join with ", " for multi-select, single value for single-select
    const answerText = selectedLabels.join(", ");
    onSubmit(answerText);
  };

  const canSubmit =
    !isAnswered &&
    selectedValues.size > 0 &&
    (!showOtherInput || otherText.trim().length > 0);

  return (
    <div className="w-full p-3 rounded-lg border border-accent/30 bg-accent/20">
      {/* Header with icon and tag */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-accent/30 flex items-center justify-center shrink-0 mt-0.5">
          <MessageCircleQuestion className="w-4 h-4 text-accent-foreground" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wide">
              Question from AI
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-accent/40 text-accent-foreground">
              {header}
            </span>
          </div>
          <p className="text-sm text-accent-foreground font-medium leading-snug">
            {question}
          </p>
        </div>
      </div>

      {/* If already answered, show the answer instead of options */}
      {isAnswered && answer ? (
        <div className="ml-11 p-3 rounded-lg bg-muted/30 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Your answer:</p>
          <p className="text-sm text-foreground/80 font-medium">{answer}</p>
        </div>
      ) : (
        <div className="ml-11">
          {/* Options */}
          {multiSelect ? (
            <div className="space-y-2.5">
              {options.map((option) => (
                <div key={option.label} className="flex items-start space-x-2">
                  <Checkbox
                    id={`${questionId}-option-${option.label}`}
                    checked={selectedValues.has(option.label)}
                    onCheckedChange={(checked) =>
                      handleMultiSelect(option.label, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={`${questionId}-option-${option.label}`}
                      className="text-sm font-medium leading-tight cursor-pointer block text-foreground"
                    >
                      {option.label}
                    </label>
                    <p className="text-xs text-foreground/70 mt-0.5 leading-snug">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
              {/* Always show "Other" option */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id={`${questionId}-option-__other__`}
                  checked={selectedValues.has("__other__")}
                  onCheckedChange={(checked) =>
                    handleMultiSelect("__other__", checked === true)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label
                    htmlFor={`${questionId}-option-__other__`}
                    className="text-sm font-medium leading-tight cursor-pointer block text-foreground"
                  >
                    Other (please specify)
                  </label>
                </div>
              </div>
              {showOtherInput && (
                <Input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Enter your answer..."
                  className="ml-6 w-[calc(100%-1.5rem)] h-8 text-sm"
                  autoFocus
                />
              )}
            </div>
          ) : (
            <RadioGroup
              value={Array.from(selectedValues)[0] || ""}
              onValueChange={handleSingleSelect}
            >
              <div className="space-y-2.5">
                {options.map((option) => (
                  <div key={option.label} className="flex items-start space-x-2">
                    <RadioGroupItem
                      value={option.label}
                      id={`${questionId}-radio-${option.label}`}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`${questionId}-radio-${option.label}`}
                        className="text-sm font-medium leading-tight cursor-pointer block text-foreground"
                      >
                        {option.label}
                      </label>
                      <p className="text-xs text-foreground/70 mt-0.5 leading-snug">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Always show "Other" option */}
                <div className="flex items-start space-x-2">
                  <RadioGroupItem
                    value="__other__"
                    id={`${questionId}-radio-__other__`}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={`${questionId}-radio-__other__`}
                      className="text-sm font-medium leading-tight cursor-pointer block text-foreground"
                    >
                      Other (please specify)
                    </label>
                  </div>
                </div>
                {showOtherInput && (
                  <Input
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder="Enter your answer..."
                    className="ml-6 w-[calc(100%-1.5rem)] h-8 text-sm"
                    autoFocus
                  />
                )}
              </div>
            </RadioGroup>
          )}

          {/* Submit button */}
          {!isAnswered && (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="sm"
              className={cn(
                "mt-3 h-8 px-4 text-xs shadow-sm",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-accent text-muted-foreground cursor-not-allowed"
              )}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Submit Answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
