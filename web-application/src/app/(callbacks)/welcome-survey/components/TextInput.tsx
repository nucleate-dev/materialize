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
    <div className="mt-3 px-4">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-slate-900 focus:ring-0 text-sm"
      />
      <p className="text-xs text-slate-400 mt-2 text-right">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
