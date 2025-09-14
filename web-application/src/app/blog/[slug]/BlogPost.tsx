import MDXComponents from "@/components/mdx/MDXComponents";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
        return "bg-muted text-muted-foreground";
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
    <main className="relative bg-background min-h-screen">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-radial from-muted/40 via-background to-background"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>

      <PremiumHeader />

      <div className="relative z-10">
        <div className="container mx-auto px-6 pt-24 pb-16 max-w-4xl">
          {/* Back to Blog */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
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
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="w-4 h-4 mr-1" />
                {post.readTime} min read
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight text-foreground">
              {post.title}
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed mb-8">
              {post.excerpt}
            </p>

            {/* Date and Share */}
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-muted-foreground">
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
            <h3 className="text-lg font-semibold mb-4 text-foreground">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Newsletter Signup */}
          <Card className="bg-muted/50 dark:bg-muted/20 border border-border">
            <CardContent className="p-8 text-center">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-foreground">
                Enjoyed this post?
              </h3>
              <p className="text-muted-foreground mb-6">
                Subscribe to get the latest insights on React Native development
                and AI-powered prototyping.
              </p>
              <Link href="/blog">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
