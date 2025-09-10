import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import MDXComponents from "@/components/mdx/MDXComponents";
import { BlogPost as BlogPostType } from "@/lib/blog";
import { MDXRemote } from "next-mdx-remote/rsc";
import {
  CalendarDays,
  Clock,
  ArrowLeft,
  BookOpen,
  Code2,
  Lightbulb,
  Rocket,
  Sparkles,
} from "lucide-react";
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

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "tutorial":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
      case "insights":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300";
      case "updates":
        return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
      case "tips":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300";
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
    <main className="relative bg-white dark:bg-black min-h-screen">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-radial from-gray-50/40 via-white to-white dark:from-gray-800/20 dark:via-black dark:to-black"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>

      <PremiumHeader />

      <div className="relative z-10">
        <div className="container mx-auto px-6 pt-24 pb-16 max-w-4xl">
          {/* Back to Blog */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>
          </div>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Badge className={getCategoryColor(post.category)}>
                <CategoryIcon className="w-3 h-3 mr-1" />
                {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
              </Badge>
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <Clock className="w-4 h-4 mr-1" />
                {post.readTime} min read
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
              {post.title}
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed mb-8">
              {post.excerpt}
            </p>

            {/* Date and Share */}
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <CalendarDays className="w-4 h-4 mr-1" />
                {formatDate(post.publishedAt)}
              </div>

              {/* Share Buttons */}
              <ShareButtons title={post.title} />
            </div>

            <Separator className="mt-8" />
          </header>

          {/* Article Content */}
          <article className="prose prose-lg max-w-none dark:prose-invert mb-12">
            <MDXRemote source={post.content} components={MDXComponents} />
          </article>

          {/* Tags */}
          <div className="mb-12">
            <h3 className="text-lg font-semibold mb-4 text-black dark:text-white">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Newsletter Signup */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-200 dark:border-blue-800">
            <CardContent className="p-8 text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-black dark:text-white">
                Enjoyed this post?
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Subscribe to get the latest insights on React Native development
                and AI-powered prototyping.
              </p>
              <Link href="/blog">
                <Button className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                  Read More Posts
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
