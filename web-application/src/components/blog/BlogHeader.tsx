"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  BookOpen,
  Code2,
  Lightbulb,
  Rocket,
  Sparkles
} from "lucide-react";

interface BlogHeaderProps {
  searchQuery: string;
  selectedCategory: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (category: string) => void;
}

const categories = [
  { key: 'all', label: 'All Posts', icon: BookOpen },
  { key: 'tutorial', label: 'Tutorials', icon: Code2 },
  { key: 'insights', label: 'Insights', icon: Lightbulb },
  { key: 'updates', label: 'Updates', icon: Rocket },
  { key: 'tips', label: 'Tips', icon: Sparkles }
];

export default function BlogHeader({ 
  searchQuery, 
  selectedCategory, 
  onSearchChange, 
  onCategoryChange 
}: BlogHeaderProps) {
  return (
    <div className="text-center mb-16">
      <div className="inline-block p-4 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl mb-6">
        <BookOpen className="w-12 h-12 text-blue-600 dark:text-blue-400" />
      </div>
      <h1 className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
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
              onChange={(e) => onSearchChange(e.target.value)}
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
                onClick={() => onCategoryChange(category.key)}
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
  );
}