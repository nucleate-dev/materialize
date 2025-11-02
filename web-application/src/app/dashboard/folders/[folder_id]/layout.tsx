import FolderHeader from "@/components/dashboard/FoldersHeader";

export default function FolderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <FolderHeader />
      <div className="flex-1 overflow-auto p-12">{children}</div>
    </div>
  );
}
