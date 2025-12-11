import type { SurveyQuestion } from "@/lib/types/surveyTypes";
import { OptionButton } from "./OptionButton";
import { TextInput } from "./TextInput";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight } from "lucide-react";

interface QuestionCardProps {
  question: SurveyQuestion;
  selectedValues: string | string[];
  otherText: string;
  onSelect: (value: string | string[]) => void;
  onOtherTextChange: (text: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  isSubmitting?: boolean;
  isLastStep?: boolean;
}

export function QuestionCard({
  question,
  selectedValues,
  otherText,
  onSelect,
  onOtherTextChange,
  onContinue,
  canContinue,
  isSubmitting = false,
  isLastStep = false,
}: QuestionCardProps) {
  const isMultiSelect = question.type === "multi-select";
  const selectedArray = Array.isArray(selectedValues)
    ? selectedValues
    : [selectedValues];

  const handleOptionClick = (value: string) => {
    if (isMultiSelect) {
      const currentSelected = selectedArray;
      if (currentSelected.includes(value)) {
        // Deselect
        onSelect(currentSelected.filter((v) => v !== value));
      } else {
        // Select
        onSelect([...currentSelected, value]);
      }
    } else {
      // Single select
      onSelect(value);
    }
  };

  const showOtherInput = selectedArray.includes("other");

  return (
    <div className="flex flex-col">
      {/* Question Title */}
      <div className="px-6 pt-6 pb-4">
        <h3 className="text-xl font-medium text-white leading-tight mb-1.5">
          {question.title}
        </h3>
        {question.subtitle && (
          <p className="text-sm text-[#8A8F98]">{question.subtitle}</p>
        )}
      </div>

      {/* Options */}
      <div className="px-6 space-y-2.5 pb-4 max-h-[340px] overflow-y-auto no-scrollbar">
        {question.options.map((option) => (
          <OptionButton
            key={option.value}
            icon={option.icon}
            label={option.label}
            isSelected={selectedArray.includes(option.value)}
            onClick={() => handleOptionClick(option.value)}
            showCheckmark={isMultiSelect}
          />
        ))}

        {/* Show text input if "Other" is selected */}
        {showOtherInput && (
          <TextInput
            value={otherText}
            onChange={onOtherTextChange}
            placeholder="Please specify..."
          />
        )}
      </div>

      {/* Continue Button */}
      <div className="p-6 pt-4 border-t border-white/5">
        <Button
          onClick={onContinue}
          disabled={!canContinue || isSubmitting}
          className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Getting ready...
            </>
          ) : isLastStep ? (
            <>
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  );
}
