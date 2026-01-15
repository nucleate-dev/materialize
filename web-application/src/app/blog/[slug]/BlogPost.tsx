// BlogPost.tsx
import MDXComponents from "@/components/mdx/MDXComponents";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { GridBackground } from "@/components/shared/GridComponent";
import { BlogPost as BlogPostType } from "@/lib/blog";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Clock,
  Code2,
  Lightbulb,
  Rocket,
  Sparkles,
} from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import ShareButtons from "./ShareButtons";

interface BlogPostProps {
  post: BlogPostType;
}

export default function BlogPost({ post }: BlogPostProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "tutorial":
        return Code2;
      case "insights":
        return Lightbulb;
      case "updates":
        return Rocket;
      case "tips":
        return Sparkles;
      default:
        return BookOpen;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const CategoryIcon = getCategoryIcon(post.category);

  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <div className="container mx-auto px-6 pt-32 pb-24 max-w-4xl">
          {/* Back to Blog */}
          <div className="mb-12">
            <Link
              href="/blog"
              className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Back to Blog
            </Link>
          </div>

          {/* Article Header */}
          <header className="mb-16">
            <div className="flex items-center gap-4 mb-8">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-accent text-xs font-medium text-primary backdrop-blur-md">
                <CategoryIcon className="w-3 h-3" />
                {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
              </span>
              <div className="flex items-center text-xs text-muted-foreground font-medium tracking-wide uppercase">
                <Clock className="w-3 h-3 mr-1.5" />
                {post.readTime} min read
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-8 leading-[1.1]">
              {post.title}
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-normal mb-10">
              {post.excerpt}
            </p>

            {/* Meta & Share Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-6 border-y border-border">
              <div className="flex items-center text-sm text-muted-foreground">
                <CalendarDays className="w-4 h-4 mr-2" />
                {formatDate(post.publishedAt)}
              </div>

              <ShareButtons title={post.title} />
            </div>
          </header>

          {/* Article Content */}
          <article
            className="prose prose-gray dark:prose-invert prose-lg max-w-none
            prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-foreground
            prose-p:text-muted-foreground prose-p:leading-8
            prose-strong:text-foreground prose-strong:font-medium
            prose-a:text-primary prose-a:no-underline hover:prose-a:text-primary/80 hover:prose-a:underline
            prose-code:text-primary prose-code:bg-accent prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-card prose-pre:border prose-pre:border-border
            prose-blockquote:border-l-primary prose-blockquote:text-foreground prose-blockquote:bg-accent prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:not-italic prose-blockquote:rounded-r-lg
            prose-li:text-muted-foreground prose-li:marker:text-muted-foreground/50
            mb-16"
          >
            <MDXRemote source={post.content} components={MDXComponents} />
          </article>

          {/* Tags */}
          <div className="mb-20 pt-10 border-t border-border">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-md bg-accent border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors cursor-default"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Newsletter/Upsell */}
          <div className="relative rounded-2xl bg-card border border-border overflow-hidden p-8 md:p-12 text-center group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 opacity-50" />
            <div className="absolute -top-[50%] -left-[10%] w-[150%] h-[150%] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent border border-border mb-6 text-primary group-hover:scale-110 transition-transform duration-500">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl md:text-3xl font-medium text-foreground mb-3">
                Enjoyed this post?
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Subscribe to get the latest insights on React Native development
                and AI-powered prototyping.
              </p>
              <Link href="/blog">
                <button className="h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-full transition-colors">
                  Read More Posts
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
