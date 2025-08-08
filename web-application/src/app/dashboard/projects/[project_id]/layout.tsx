import ProjectsHeader from "@/components/dashboard/ProjectsHeader";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <ProjectsHeader />
      <div className="flex-1 overflow-auto p-12">{children}</div>
    </div>
  );
}
