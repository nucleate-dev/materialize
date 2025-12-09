import { useState } from "react";
import type { SurveyQuestion } from "@/lib/types/surveyTypes";
import { OptionButton } from "./OptionButton";
import { TextInput } from "./TextInput";
import { Button } from "@/components/ui/button";

interface QuestionCardProps {
  question: SurveyQuestion;
  selectedValues: string | string[];
  otherText: string;
  onSelect: (value: string | string[]) => void;
  onOtherTextChange: (text: string) => void;
  onContinue: () => void;
  canContinue: boolean;
}

export function QuestionCard({
  question,
  selectedValues,
  otherText,
  onSelect,
  onOtherTextChange,
  onContinue,
  canContinue,
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
    <div className="flex flex-col h-full">
      {/* Question Title */}
      <div className="px-6 pb-4">
        <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
          {question.title}
        </h3>
        {question.subtitle && (
          <p className="text-sm text-slate-500">{question.subtitle}</p>
        )}
      </div>

      {/* Options */}
      <div className="flex-1 px-4 overflow-y-auto no-scrollbar space-y-3 pb-6">
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
      <div className="p-6 bg-gradient-to-t from-white via-white to-transparent">
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          className="w-full py-6 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
