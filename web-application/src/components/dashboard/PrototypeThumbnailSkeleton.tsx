"use client";

import { Card, CardContent } from "@/components/ui/card";

const PrototypeThumbnailSkeleton = () => {
  return (
    <div className="group transition-all duration-300">
      <Card className="bg-background/80 backdrop-blur-sm border border-border overflow-hidden shadow-sm">
        {/* Image Container Skeleton */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer"></div>
        </div>

        {/* Info Section Skeleton */}
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            {/* Title skeleton */}
            <div className="flex-1 mr-3">
              <div className="h-5 bg-muted rounded animate-pulse w-3/4"></div>
            </div>
            {/* Badge skeleton */}
            <div className="h-5 w-20 bg-muted rounded-full animate-pulse"></div>
          </div>

          {/* Last modified skeleton */}
          <div className="flex items-center gap-2 mt-3">
            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
            <div className="h-4 bg-muted rounded animate-pulse w-32"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrototypeThumbnailSkeleton;
