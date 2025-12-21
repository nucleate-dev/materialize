import { getDocsSidebar } from "@/lib/docs";
import { Metadata } from "next";
import { DocsHeader } from "./DocsHeader";
import { DocsMobileSidebar, DocsSidebar } from "./DocsSidebar";

export const metadata: Metadata = {
  title: "Documentation | Nucleate",
  description: "Learn how to build apps with Nucleate - from getting started to advanced patterns.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sections = getDocsSidebar();

  return (
    <div className="min-h-screen bg-background">
      <DocsHeader />
      <div className="flex">
        <DocsSidebar sections={sections} />
        <main className="flex-1 min-w-0">
          {children}
        </main>
        <DocsMobileSidebar sections={sections} />
      </div>
    </div>
  );
}
