import { Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

interface OptionButtonProps {
  icon: string;
  label: string;
  isSelected: boolean;
  onClick: () => void;
  showCheckmark?: boolean; // For multi-select
}

export function OptionButton({
  icon,
  label,
  isSelected,
  onClick,
  showCheckmark = false,
}: OptionButtonProps) {
  // Dynamically get the icon component from lucide-react
  const IconComponent = (LucideIcons as any)[icon] || LucideIcons.Circle;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-4 rounded-2xl flex items-center gap-4 text-left transition-all duration-200",
        "border-2 hover:scale-[1.02] active:scale-[0.98]",
        isSelected
          ? "bg-slate-950 border-slate-900 text-white shadow-lg"
          : "bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-300"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
          isSelected ? "bg-white/20" : "bg-slate-200"
        )}
      >
        <IconComponent
          className={cn("w-5 h-5", isSelected ? "text-white" : "text-slate-600")}
        />
      </div>
      <span className="font-medium text-sm flex-1">{label}</span>
      {showCheckmark && isSelected && (
        <Check className="w-5 h-5 text-white shrink-0" />
      )}
    </button>
  );
}
