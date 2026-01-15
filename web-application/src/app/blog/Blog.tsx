// Blog.tsx
"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlogPost } from "@/lib/blog";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Code2,
  Lightbulb,
  Rocket,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const categories = [
  { key: "all", label: "All Posts", icon: BookOpen },
  { key: "tutorial", label: "Tutorials", icon: Code2 },
  { key: "insights", label: "Insights", icon: Lightbulb },
  { key: "updates", label: "Updates", icon: Rocket },
  { key: "tips", label: "Tips", icon: Sparkles },
];

interface BlogProps {
  initialPosts: BlogPost[];
}

export default function Blog({ initialPosts }: BlogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredPosts = useMemo(() => {
    return initialPosts.filter((post) => {
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        );

      const matchesCategory =
        selectedCategory === "all" || post.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [initialPosts, searchQuery, selectedCategory]);

  const featuredPosts = useMemo(
    () => filteredPosts.filter((post) => post.featured),
    [filteredPosts],
  );
  const regularPosts = useMemo(
    () => filteredPosts.filter((post) => !post.featured),
    [filteredPosts],
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        {/* Hero Section */}
        <section className="relative pt-32 pb-12 lg:pt-48 lg:pb-20 px-6">
          <div className="container mx-auto max-w-5xl">
            {/* Header Content */}
            <div className="text-center space-y-6 mb-16">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground to-foreground/60 pb-2">
                Blog
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-normal leading-relaxed">
                Design engineering, rapid prototyping, and UI/UX insights for
                modern product builders.
              </p>
            </div>

            {/* Search and Filters */}
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/20 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex items-center transition-colors duration-200 focus-within:border-primary/30">
                  <div className="pl-4 text-muted-foreground">
                    <Search className="w-5 h-5" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Search for tutorials, updates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground border-none h-14 focus-visible:ring-0"
                  />
                </div>
              </div>

              {/* Category Chips */}
              <div className="flex flex-wrap justify-center gap-2">
                {categories.map((category) => {
                  const Icon = category.icon;
                  const isSelected = selectedCategory === category.key;
                  return (
                    <button
                      key={category.key}
                      onClick={() => setSelectedCategory(category.key)}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        ${
                          isSelected
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground border border-border"
                        }
                      `}
                    >
                      <Icon className="w-4 h-4" />
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="pb-24 px-6">
          <div className="container mx-auto max-w-6xl">
            {/* Featured Posts */}
            {featuredPosts.length > 0 && (
              <div className="mb-20">
                <div className="flex items-end justify-between mb-8">
                  <h2 className="text-3xl font-medium text-foreground">Featured</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {featuredPosts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="block h-full"
                    >
                      <article className="group relative h-full rounded-2xl bg-card border border-border overflow-hidden hover:border-primary/30 transition-all duration-300 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/40 z-10 pointer-events-none" />

                        {/* Featured Badge */}
                        <div className="absolute top-4 left-4 z-20">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background/50 text-xs font-medium text-foreground backdrop-blur-md">
                            <Sparkles className="w-3 h-3 text-primary" />
                            Featured
                          </span>
                        </div>

                        {/* Content */}
                        <div className="p-8 flex flex-col h-full z-20">
                          <div className="mb-4">
                            <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                              {post.category}
                            </span>
                          </div>

                          <h3 className="text-2xl md:text-3xl font-medium text-foreground mb-4 group-hover:text-primary transition-colors">
                            {post.title}
                          </h3>

                          <p className="text-muted-foreground text-lg leading-relaxed mb-8 line-clamp-3 flex-1">
                            {post.excerpt}
                          </p>

                          <div className="flex items-center justify-between pt-6 border-t border-border mt-auto">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-bold text-primary-foreground ring-2 ring-card">
                                {post.authorAvatar}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm text-foreground font-medium">
                                  {post.author}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  {formatDate(post.publishedAt)} •{" "}
                                  {post.readTime} min read
                                </span>
                              </div>
                            </div>

                            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                            </div>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Posts Grid */}
            {regularPosts.length > 0 && (
              <div className="mb-20">
                <div className="flex items-end justify-between mb-8">
                  <h2 className="text-3xl font-medium text-foreground">
                    {featuredPosts.length > 0 ? "Latest" : "All Posts"}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regularPosts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="block"
                    >
                      <article className="group h-full flex flex-col rounded-2xl bg-card border border-border overflow-hidden hover:border-primary/30 transition-all duration-300 hover:shadow-2xl hover:shadow-background/50">
                        <div className="p-6 flex flex-col h-full">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-medium text-muted-foreground border border-border px-2 py-1 rounded bg-accent">
                              {post.category}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {post.readTime}m
                            </span>
                          </div>

                          <h3 className="text-xl font-medium text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2">
                            {post.title}
                          </h3>

                          <p className="text-sm text-muted-foreground leading-relaxed mb-6 line-clamp-3 flex-1">
                            {post.excerpt}
                          </p>

                          <div className="flex items-center gap-3 pt-4 border-t border-border mt-auto">
                            <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {post.authorAvatar}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-foreground/80">
                                {post.author}
                              </span>
                              <span className="mx-1">·</span>
                              {formatDate(post.publishedAt)}
                            </div>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredPosts.length === 0 && (
              <div className="py-24 text-center border border-dashed border-border rounded-2xl bg-accent/50">
                <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-medium text-foreground mb-2">
                  No posts found
                </h3>
                <p className="text-muted-foreground mb-8">
                  We couldn&apos;t find any posts matching &ldquo;{searchQuery}
                  &rdquo;
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="bg-accent border-border text-foreground hover:bg-accent/80"
                >
                  Clear all filters
                </Button>
              </div>
            )}

            {/* Newsletter Section */}
            <div className="relative mt-24 rounded-2xl bg-card border border-border overflow-hidden p-8 md:p-12 text-center">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <div className="w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full" />
              </div>

              <div className="relative z-10 max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent border border-border mb-6 text-primary">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">
                  Stay in the loop
                </h2>
                <p className="text-muted-foreground mb-8 text-lg">
                  Get the latest insights on React Native development and
                  AI-powered prototyping delivered directly to your inbox.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="bg-background border-border text-foreground h-11 focus-visible:ring-primary/50"
                  />
                  <Button className="h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-md">
                    Subscribe
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
