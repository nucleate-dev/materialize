import { Input } from "@/components/ui/input";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function TextInput({
  value,
  onChange,
  placeholder = "Please specify...",
  maxLength = 200,
}: TextInputProps) {
  return (
    <div className="mt-2">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-4 py-3 rounded-xl bg-background border border-input text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-0 text-sm"
      />
      <p className="text-xs text-muted-foreground mt-1.5 text-right">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
