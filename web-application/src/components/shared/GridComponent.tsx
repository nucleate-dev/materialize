interface GridBackgroundProps {
  forceDarkMode?: boolean;
}

export const GridBackground = ({
  forceDarkMode = false,
}: GridBackgroundProps) => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
    {/* Background color */}
    <div className="absolute inset-0 bg-background" />

    {/* Gradient blobs - subtle muted tones for depth, not brand colors */}
    <div
      className={
        forceDarkMode
          ? "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-muted-foreground/5 blur-[120px] rounded-full"
          : "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-muted-foreground/3 dark:bg-muted-foreground/5 blur-[120px] rounded-full"
      }
    />
    <div
      className={
        forceDarkMode
          ? "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-border/30 blur-[100px] rounded-full"
          : "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-border/20 dark:bg-border/30 blur-[100px] rounded-full"
      }
    />

    {/* Grid pattern - subtle */}
    <div
      className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
      style={{
        backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }}
    />

    {/* Gradient overlay for depth */}
    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
  </div>
);
