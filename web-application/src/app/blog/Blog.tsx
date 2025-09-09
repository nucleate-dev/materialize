"use client";

import PremiumHeader from "@/components/PremiumHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BlogPost } from "@/lib/blog";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock,
  Code2,
  Lightbulb,
  Rocket,
  Search,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const categories = [
  { key: 'all', label: 'All Posts', icon: BookOpen },
  { key: 'tutorial', label: 'Tutorials', icon: Code2 },
  { key: 'insights', label: 'Insights', icon: Lightbulb },
  { key: 'updates', label: 'Updates', icon: Rocket },
  { key: 'tips', label: 'Tips', icon: Sparkles }
];

interface BlogProps {
  initialPosts: BlogPost[];
}

export default function Blog({ initialPosts }: BlogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredPosts = useMemo(() => {
    return initialPosts.filter(post => {
      const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = selectedCategory === "all" || post.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [initialPosts, searchQuery, selectedCategory]);

  const featuredPosts = useMemo(() => filteredPosts.filter(post => post.featured), [filteredPosts]);
  const regularPosts = useMemo(() => filteredPosts.filter(post => !post.featured), [filteredPosts]);

  const getCategoryIcon = (category: string) => {
    const categoryData = categories.find(cat => cat.key === category);
    return categoryData?.icon || BookOpen;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tutorial': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'insights': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
      case 'updates': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
      case 'tips': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300';
    }
  };

  return (
    <main className="relative bg-white dark:bg-black min-h-screen">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-radial from-gray-50/40 via-white to-white dark:from-gray-800/20 dark:via-black dark:to-black"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>

      <PremiumHeader />

      <div className="relative z-10">
        {/* Header */}
        <div className="container mx-auto px-6 pt-24 pb-16">
          <div className="text-center mb-16">
            <div className="inline-block p-4 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl mb-6">
              <BookOpen className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent leading-tight">
              Blog
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
              Insights, tutorials, and updates on React Native development, AI-powered prototyping, and mobile app design.
            </p>

            {/* Search and Filter */}
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    type="text"
                    placeholder="Search posts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Button
                      key={category.key}
                      variant={selectedCategory === category.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category.key)}
                      className="flex items-center gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {category.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Featured Posts */}
          {featuredPosts.length > 0 && (
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8 text-center text-black dark:text-white">
                Featured Posts
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {featuredPosts.map((post) => {
                  const CategoryIcon = getCategoryIcon(post.category);
                  return (
                    <Link key={post.slug} href={`/blog/${post.slug}`}>
                      <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] border-2 hover:border-primary/20 cursor-pointer">
                        <CardHeader className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Badge className={getCategoryColor(post.category)}>
                              <CategoryIcon className="w-3 h-3 mr-1" />
                              {post.category}
                            </Badge>
                            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                              <Clock className="w-4 h-4 mr-1" />
                              {post.readTime} min read
                            </div>
                          </div>
                          <h3 className="text-2xl font-bold group-hover:text-primary transition-colors line-clamp-2">
                            {post.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
                            {post.excerpt}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                {post.authorAvatar}
                              </div>
                              <div>
                                <p className="font-medium text-sm text-black dark:text-white">{post.author}</p>
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                  <CalendarDays className="w-3 h-3 mr-1" />
                                  {formatDate(post.publishedAt)}
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="group-hover:translate-x-1 transition-transform">
                              Read More
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-4">
                            {post.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regular Posts */}
          {regularPosts.length > 0 && (
            <div>
              <h2 className="text-3xl font-bold mb-8 text-center text-black dark:text-white">
                {featuredPosts.length > 0 ? 'More Posts' : 'All Posts'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {regularPosts.map((post) => {
                  const CategoryIcon = getCategoryIcon(post.category);
                  return (
                    <Link key={post.slug} href={`/blog/${post.slug}`}>
                      <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-[1.01] cursor-pointer">
                        <CardHeader className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge className={getCategoryColor(post.category)}>
                              <CategoryIcon className="w-3 h-3 mr-1" />
                              {post.category}
                            </Badge>
                            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                              <Clock className="w-3 h-3 mr-1" />
                              {post.readTime} min
                            </div>
                          </div>
                          <h3 className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-2">
                            {post.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                            {post.excerpt}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-xs">
                                {post.authorAvatar}
                              </div>
                              <div>
                                <p className="font-medium text-xs text-black dark:text-white">{post.author}</p>
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                  <CalendarDays className="w-3 h-3 mr-1" />
                                  {formatDate(post.publishedAt)}
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="group-hover:translate-x-1 transition-transform p-1">
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {post.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {post.tags.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{post.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* No Results */}
          {filteredPosts.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-black dark:text-white">No posts found</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Try adjusting your search query or category filter.
              </p>
              <Button onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
                Clear Filters
              </Button>
            </div>
          )}

          {/* Subscribe Section */}
          <div className="mt-24 text-center">
            <Card className="max-w-2xl mx-auto bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-200 dark:border-blue-800">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-black dark:text-white">Stay Updated</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Get the latest insights on React Native development and AI-powered prototyping delivered to your inbox.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="flex-1"
                  />
                  <Button className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                    Subscribe
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}