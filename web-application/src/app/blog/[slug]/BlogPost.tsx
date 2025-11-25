// BlogPost.tsx
import MDXComponents from "@/components/mdx/MDXComponents";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
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

// --- Linear-style Utilities ---
const GridBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
    <div className="absolute inset-0 bg-[#0B0C0E]" />
    <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full mix-blend-screen" />
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-transparent to-transparent" />
  </div>
);

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
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader forceDarkMode />

        <div className="container mx-auto px-6 pt-32 pb-24 max-w-4xl">
          {/* Back to Blog */}
          <div className="mb-12">
            <Link
              href="/blog"
              className="group inline-flex items-center gap-2 text-sm text-[#8A8F98] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Back to Blog
            </Link>
          </div>

          {/* Article Header */}
          <header className="mb-16">
            <div className="flex items-center gap-4 mb-8">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-indigo-300 backdrop-blur-md">
                <CategoryIcon className="w-3 h-3" />
                {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
              </span>
              <div className="flex items-center text-xs text-[#8A8F98] font-medium tracking-wide uppercase">
                <Clock className="w-3 h-3 mr-1.5" />
                {post.readTime} min read
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white mb-8 leading-[1.1]">
              {post.title}
            </h1>

            <p className="text-xl md:text-2xl text-[#8A8F98] leading-relaxed font-normal mb-10">
              {post.excerpt}
            </p>

            {/* Meta & Share Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-6 border-y border-white/5">
              <div className="flex items-center gap-4">
                {/* Author Avatar Placeholder (can be dynamic) */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white ring-2 ring-[#0B0C0E]">
                  {post.author ? post.author.charAt(0) : "M"}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">{post.author || "Materialize Team"}</span>
                  <div className="flex items-center text-xs text-[#8A8F98]">
                    <CalendarDays className="w-3 h-3 mr-1.5" />
                    {formatDate(post.publishedAt)}
                  </div>
                </div>
              </div>

              <ShareButtons title={post.title} />
            </div>
          </header>

          {/* Article Content */}
          <article className="prose prose-invert prose-lg max-w-none 
            prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-white 
            prose-p:text-[#8A8F98] prose-p:leading-8 
            prose-strong:text-white prose-strong:font-medium
            prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:text-indigo-300 hover:prose-a:underline
            prose-code:text-indigo-300 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-[#141517] prose-pre:border prose-pre:border-white/10
            prose-blockquote:border-l-indigo-500 prose-blockquote:text-white prose-blockquote:bg-white/5 prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:not-italic prose-blockquote:rounded-r-lg
            prose-li:text-[#8A8F98] prose-li:marker:text-white/20
            mb-16">
            <MDXRemote source={post.content} components={MDXComponents} />
          </article>

          {/* Tags */}
          <div className="mb-20 pt-10 border-t border-white/5">
            <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-sm text-[#8A8F98] hover:text-white hover:border-white/20 transition-colors cursor-default"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Newsletter/Upsell (Visual match to Home/Blog list) */}
          <div className="relative rounded-2xl bg-[#141517] border border-white/10 overflow-hidden p-8 md:p-12 text-center group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-blue-500/10 opacity-50" />
            <div className="absolute -top-[50%] -left-[10%] w-[150%] h-[150%] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-6 text-indigo-400 group-hover:scale-110 transition-transform duration-500">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl md:text-3xl font-medium text-white mb-3">
                Enjoyed this post?
              </h3>
              <p className="text-[#8A8F98] mb-8 text-lg">
                Subscribe to get the latest insights on React Native development
                and AI-powered prototyping.
              </p>
              <Link href="/blog">
                <button className="h-11 px-8 bg-white text-black hover:bg-white/90 font-medium rounded-full transition-colors">
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