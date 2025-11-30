// Blog.tsx
"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
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
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader forceDarkMode />

        {/* Hero Section */}
        <section className="relative pt-32 pb-12 lg:pt-48 lg:pb-20 px-6">
          <div className="container mx-auto max-w-5xl">
            {/* Header Content */}
            <div className="text-center space-y-6 mb-16">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-2">
                Blog
              </h1>
              <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto font-normal leading-relaxed">
                Insights, tutorials, and updates on building products{" "}
                <br className="hidden md:block" /> with Materialize and React
                Native.
              </p>
            </div>

            {/* Search and Filters (Styled like the "Ask" input) */}
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-blue-500/30 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <div className="relative bg-[#141517] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex items-center transition-colors duration-200 focus-within:border-white/20 focus-within:bg-[#18191B]">
                  <div className="pl-4 text-white/40">
                    <Search className="w-5 h-5" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Search for tutorials, updates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-lg text-white placeholder:text-white/30 border-none h-14 focus-visible:ring-0"
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
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
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
                  <h2 className="text-3xl font-medium text-white">Featured</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {featuredPosts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="block h-full"
                    >
                      <article className="group relative h-full rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40 z-10 pointer-events-none" />

                        {/* Featured Badge */}
                        <div className="absolute top-4 left-4 z-20">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-black/50 text-xs font-medium text-white backdrop-blur-md">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            Featured
                          </span>
                        </div>

                        {/* Content */}
                        <div className="p-8 flex flex-col h-full z-20">
                          <div className="mb-4">
                            <span className="text-xs font-semibold tracking-wider text-indigo-400 uppercase">
                              {post.category}
                            </span>
                          </div>

                          <h3 className="text-2xl md:text-3xl font-medium text-white mb-4 group-hover:text-indigo-200 transition-colors">
                            {post.title}
                          </h3>

                          <p className="text-[#8A8F98] text-lg leading-relaxed mb-8 line-clamp-3 flex-1">
                            {post.excerpt}
                          </p>

                          <div className="flex items-center justify-between pt-6 border-t border-white/5 mt-auto">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-[#141517]">
                                {post.authorAvatar}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm text-white font-medium">
                                  {post.author}
                                </span>
                                <span className="text-xs text-white/40 flex items-center gap-1">
                                  {formatDate(post.publishedAt)} •{" "}
                                  {post.readTime} min read
                                </span>
                              </div>
                            </div>

                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                              <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-white" />
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
                  <h2 className="text-3xl font-medium text-white">
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
                      <article className="group h-full flex flex-col rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:shadow-black/50">
                        <div className="p-6 flex flex-col h-full">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-medium text-white/50 border border-white/10 px-2 py-1 rounded bg-white/5">
                              {post.category}
                            </span>
                            <span className="text-xs text-white/30 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {post.readTime}m
                            </span>
                          </div>

                          <h3 className="text-xl font-medium text-white mb-3 group-hover:text-indigo-300 transition-colors line-clamp-2">
                            {post.title}
                          </h3>

                          <p className="text-sm text-[#8A8F98] leading-relaxed mb-6 line-clamp-3 flex-1">
                            {post.excerpt}
                          </p>

                          <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-auto">
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/70">
                              {post.authorAvatar}
                            </div>
                            <div className="text-xs text-white/40">
                              <span className="text-white/60">
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
              <div className="py-24 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search className="w-6 h-6 text-white/40" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2">
                  No posts found
                </h3>
                <p className="text-[#8A8F98] mb-8">
                  We couldn&apos;t find any posts matching &ldquo;{searchQuery}
                  &rdquo;
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                  Clear all filters
                </Button>
              </div>
            )}

            {/* Newsletter Section - Styled like the Upsell/Pricing */}
            <div className="relative mt-24 rounded-2xl bg-[#141517] border border-white/10 overflow-hidden p-8 md:p-12 text-center">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-blue-500/10 opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <div className="w-[500px] h-[500px] bg-indigo-500/20 blur-[120px] rounded-full" />
              </div>

              <div className="relative z-10 max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-6 text-indigo-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">
                  Stay in the loop
                </h2>
                <p className="text-[#8A8F98] mb-8 text-lg">
                  Get the latest insights on React Native development and
                  AI-powered prototyping delivered directly to your inbox.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="bg-[#0B0C0E] border-white/10 text-white h-11 focus-visible:ring-indigo-500/50"
                  />
                  <Button className="h-11 px-8 bg-white text-black hover:bg-white/90 font-medium rounded-md">
                    Subscribe
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t border-white/5 bg-[#0B0C0E] text-sm">
          <div className="container mx-auto px-6 max-w-6xl flex flex-col md:flex-row justify-between items-center text-[#8A8F98] gap-6">
            <div className="flex gap-6">
              <span className="hover:text-white cursor-pointer transition-colors">
                Twitter
              </span>
              <span className="hover:text-white cursor-pointer transition-colors">
                GitHub
              </span>
              <span className="hover:text-white cursor-pointer transition-colors">
                Discord
              </span>
            </div>
            <div className="flex gap-6">
              <span className="hover:text-white cursor-pointer transition-colors">
                Privacy
              </span>
              <span className="hover:text-white cursor-pointer transition-colors">
                Terms
              </span>
              <span>© 2025 Materialize Inc.</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
