type ButtonProps = Omit<React.ComponentPropsWithoutRef<"input">, "color">;

export function Button({ ...props }: ButtonProps) {
  return (
    <input
      {...props}
      className="w-full cursor-pointer rounded-lg border border-primary bg-primary p-4 text-white transition hover:bg-opacity-90"
    />
  );
}
