import { cn } from "@/lib/classNames";
import * as LucideIcons from "lucide-react";
import { Check, Circle, LucideIcon } from "lucide-react";

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
  const IconComponent =
    (LucideIcons[icon as keyof typeof LucideIcons] as LucideIcon) || Circle;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3.5 rounded-xl flex items-center gap-3.5 text-left transition-all duration-200",
        "border hover:scale-[1.01] active:scale-[0.99]",
        isSelected
          ? "bg-primary/5 border-primary text-foreground shadow-sm"
          : "bg-card border-border text-muted-foreground hover:bg-accent hover:border-accent-foreground/20 hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <IconComponent
          className={cn("w-4 h-4", isSelected ? "text-primary-foreground" : "text-muted-foreground")}
        />
      </div>
      <span className="font-medium text-sm flex-1">{label}</span>
      {showCheckmark && (
        <div
          className={cn(
            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
            isSelected
              ? "bg-primary border-primary"
              : "bg-transparent border-input",
          )}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
        </div>
      )}
    </button>
  );
}
