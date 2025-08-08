import { useId } from "react";

export function TextField({
  label,
  type = "text",
  className,
  error,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"input">, "id"> & {
  label: string;
  error?: string;
}) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block mb-1 text-sm text-gray-700">
          {label}
        </label>
      )}
      <div>
        <input
          id={id}
          type={type}
          {...props}
          className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 outline-none focus:border-primary focus-visible:shadow-none"
        />
      </div>
      {error && (
        <label htmlFor={id} className="block text-xs font-small text-red-700">
          {error}
        </label>
      )}
    </div>
  );
}
