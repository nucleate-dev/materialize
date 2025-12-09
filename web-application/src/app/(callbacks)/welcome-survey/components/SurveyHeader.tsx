import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SurveyHeaderProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  canGoBack: boolean;
}

export function SurveyHeader({
  currentStep,
  totalSteps,
  onBack,
  canGoBack,
}: SurveyHeaderProps) {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div className="px-6 pt-4 pb-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          disabled={!canGoBack}
          className="h-10 w-10 rounded-full hover:bg-slate-100 disabled:opacity-0"
        >
          <ChevronLeft className="w-6 h-6 text-slate-900" />
        </Button>
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="text-sm font-medium text-slate-500 min-w-[3rem] text-right">
          {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  );
}
