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
        className="w-full px-4 py-3 rounded-xl bg-[#0B0C0E] border border-white/10 text-white placeholder:text-white/30 focus:border-white/20 focus:ring-0 text-sm"
      />
      <p className="text-xs text-[#8A8F98] mt-1.5 text-right">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
