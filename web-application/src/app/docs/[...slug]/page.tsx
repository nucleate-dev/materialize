import MDXComponents from "@/components/mdx/MDXComponents";
import { getAllDocs, getDocBySlug, getDocsSidebar } from "@/lib/docs";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { notFound } from "next/navigation";

interface DocPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({
    slug: doc.slug.split("/"),
  }));
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getDocBySlug(slugPath);

  if (!doc) {
    return {
      title: "Page Not Found | Nucleate Docs",
    };
  }

  return {
    title: `${doc.title} | Nucleate Docs`,
    description: doc.description,
  };
}

function getAdjacentDocs(currentSlug: string) {
  const sections = getDocsSidebar();
  const allPages = sections.flatMap((section) => section.pages);
  const currentIndex = allPages.findIndex((page) => page.slug === currentSlug);

  return {
    prev: currentIndex > 0 ? allPages[currentIndex - 1] : null,
    next:
      currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getDocBySlug(slugPath);

  if (!doc) {
    notFound();
  }

  const { prev, next } = getAdjacentDocs(slugPath);

  return (
    <div className="px-6 py-10 lg:px-12 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link
              href="/docs"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </Link>
          </li>
          <li>/</li>
          <li className="text-foreground">{doc.title}</li>
        </ol>
      </nav>

      {/* Content */}
      <article className="prose prose-gray dark:prose-invert max-w-none prose-headings:scroll-mt-20">
        <h1 className="text-4xl font-bold mb-4">{doc.title}</h1>
        {doc.description && (
          <p className="text-xl text-muted-foreground mb-8 not-prose">
            {doc.description}
          </p>
        )}
        <MDXRemote source={doc.content} components={MDXComponents} />
      </article>

      {/* Still Stuck CTA */}
      <div className="mt-16 p-6 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-full bg-primary/10">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Still stuck?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Ask Nucleate AI for help with this topic.
            </p>
            <Link
              href={`/?prompt=Help me with: ${encodeURIComponent(doc.title)}`}
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Ask Nucleate →
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-12 pt-6 border-t border-border">
        <div className="flex justify-between gap-4">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group flex-1 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <ChevronLeft className="h-3 w-3" />
                Previous
              </span>
              <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex-1 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-right"
            >
              <span className="text-xs text-muted-foreground flex items-center justify-end gap-1 mb-1">
                Next
                <ChevronRight className="h-3 w-3" />
              </span>
              <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                {next.title}
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </nav>
    </div>
  );
}
