import { cn } from "@/lib/classNames";

export const SectionCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "bg-white dark:bg-[#141517] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden shadow-sm dark:shadow-none",
      className,
    )}
  >
    {children}
  </div>
);

export const SectionHeader = ({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 flex items-start justify-between">
    <div className="space-y-1">
      <h3 className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500 dark:text-[#8A8F98]" />}
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 dark:text-[#8A8F98]">
          {description}
        </p>
      )}
    </div>
  </div>
);
