import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

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
    <div className="px-6 pt-6 pb-4 border-b border-border bg-card">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          disabled={!canGoBack}
          className="h-8 w-8 rounded-full hover:bg-accent disabled:opacity-0 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </Button>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground min-w-[3rem] text-right">
          {currentStep}/{totalSteps}
        </span>
      </div>
    </div>
  );
}
