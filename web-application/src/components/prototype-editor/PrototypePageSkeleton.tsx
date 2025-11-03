export default function PrototypePageSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Chat Skeleton */}
        <div
          className="flex flex-col relative z-10 bg-background overflow-hidden border-r border-border"
          style={{ width: "40%", minWidth: "320px" }}
        >
          {/* Chat Header Skeleton */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 flex-1 bg-muted rounded animate-pulse" />
              <div className="h-9 w-20 bg-muted rounded animate-pulse" />
            </div>
          </div>

          {/* Chat Messages Skeleton */}
          <div className="flex-1 p-4 space-y-4 overflow-hidden">
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Chat Input Skeleton */}
          <div className="p-4 border-t border-border">
            <div className="h-24 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Divider */}
        <div className="relative w-1 bg-border flex-shrink-0" />

        {/* Right Panel - Preview Skeleton */}
        <div
          className="flex flex-col relative z-10 bg-background overflow-hidden"
          style={{ width: "60%", minWidth: "320px" }}
        >
          {/* Preview Header Skeleton */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-6 w-20 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
              <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            </div>
          </div>

          {/* Preview Content Skeleton */}
          <div className="flex-1 flex items-center justify-center bg-muted/20">
            <div className="flex flex-col items-center gap-4">
              {/* Phone Frame Skeleton */}
              <div className="relative w-[375px] h-[667px] bg-muted rounded-[3rem] border-[14px] border-background shadow-2xl animate-pulse">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-background rounded-b-2xl" />
                <div className="w-full h-full bg-muted/50 rounded-[2.5rem] p-4 space-y-4">
                  <div className="h-8 w-2/3 bg-background rounded" />
                  <div className="h-32 w-full bg-background rounded" />
                  <div className="h-4 w-3/4 bg-background rounded" />
                  <div className="h-4 w-1/2 bg-background rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
