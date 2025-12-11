import { Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/classNames";

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
        "w-full p-3.5 rounded-xl flex items-center gap-3.5 text-left transition-all duration-200",
        "border hover:scale-[1.01] active:scale-[0.99]",
        isSelected
          ? "bg-white/10 border-white/20 text-white shadow-lg shadow-white/5"
          : "bg-white/[0.02] border-white/10 text-white/80 hover:bg-white/[0.05] hover:border-white/15"
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          isSelected ? "bg-gradient-to-br from-indigo-500 to-blue-500" : "bg-white/10"
        )}
      >
        <IconComponent
          className={cn("w-4 h-4", isSelected ? "text-white" : "text-white/60")}
        />
      </div>
      <span className="font-medium text-sm flex-1">{label}</span>
      {showCheckmark && (
        <div
          className={cn(
            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
            isSelected
              ? "bg-white border-white"
              : "bg-transparent border-white/20"
          )}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-[#141517]" />}
        </div>
      )}
    </button>
  );
}
