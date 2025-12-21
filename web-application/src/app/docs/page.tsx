import { getFirstDocSlug } from "@/lib/docs";
import { redirect } from "next/navigation";

export default function DocsPage() {
  const firstSlug = getFirstDocSlug();

  if (firstSlug) {
    redirect(`/docs/${firstSlug}`);
  }

  // Fallback if no docs exist yet
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Documentation Coming Soon
        </h1>
        <p className="text-muted-foreground">
          We&apos;re working on comprehensive documentation for Nucleate.
        </p>
      </div>
    </div>
  );
}
