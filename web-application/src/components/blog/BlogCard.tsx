"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock,
  Code2,
  Lightbulb,
  Rocket,
  Sparkles
} from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  authorAvatar: string;
  publishedAt: string;
  readTime: number;
  tags: string[];
  category: 'tutorial' | 'insights' | 'updates' | 'tips';
  featured: boolean;
  slug: string;
}

interface BlogCardProps {
  post: BlogPost;
  variant?: 'featured' | 'regular';
}

export default function BlogCard({ post, variant = 'regular' }: BlogCardProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'tutorial': return Code2;
      case 'insights': return Lightbulb;
      case 'updates': return Rocket;
      case 'tips': return Sparkles;
      default: return BookOpen;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tutorial': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'insights': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
      case 'updates': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
      case 'tips': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const CategoryIcon = getCategoryIcon(post.category);

  if (variant === 'featured') {
    return (
      <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] border-2 hover:border-primary/20 bg-card">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge className={getCategoryColor(post.category)}>
              <CategoryIcon className="w-3 h-3 mr-1" />
              {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
            </Badge>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="w-4 h-4 mr-1" />
              {post.readTime} min read
            </div>
          </div>
          <h3 className="text-2xl font-bold group-hover:text-primary transition-colors line-clamp-2 text-card-foreground">
            {post.title}
          </h3>
          <p className="text-muted-foreground line-clamp-3 leading-relaxed">
            {post.excerpt}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-muted-foreground">
              <CalendarDays className="w-3 h-3 mr-1" />
              {formatDate(post.publishedAt)}
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
    );
  }

  return (
    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-[1.01] bg-card">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge className={getCategoryColor(post.category)}>
            <CategoryIcon className="w-3 h-3 mr-1" />
            {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
          </Badge>
          <div className="flex items-center text-xs text-muted-foreground">
            <Clock className="w-3 h-3 mr-1" />
            {post.readTime} min
          </div>
        </div>
        <h3 className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-2 text-card-foreground">
          {post.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {post.excerpt}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center text-xs text-muted-foreground">
            <CalendarDays className="w-3 h-3 mr-1" />
            {formatDate(post.publishedAt)}
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
  );
}