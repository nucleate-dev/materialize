interface GridBackgroundProps {
    forceDarkMode?: boolean;
}

export const GridBackground = ({ forceDarkMode = false }: GridBackgroundProps) => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {/* Background color - dark in dark mode or when forced, white in light mode */}
        <div className={forceDarkMode ? "absolute inset-0 bg-[#0B0C0E]" : "absolute inset-0 bg-[#0B0C0E] dark:bg-[#0B0C0E] bg-white"} />

        {/* Gradient blobs - only show in dark mode or when forced */}
        <div className={forceDarkMode ? "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen" : "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen dark:block hidden"} />
        <div className={forceDarkMode ? "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full mix-blend-screen" : "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full mix-blend-screen dark:block hidden"} />

        {/* Grid pattern - white/low opacity in dark mode, dark/very low opacity in light mode */}
        <div
            className={forceDarkMode ? "absolute inset-0 opacity-[0.03]" : "absolute inset-0 opacity-[0.03] dark:opacity-[0.03] opacity-[0.02]"}
            style={{
                backgroundImage: forceDarkMode
                    ? `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`
                    : `linear-gradient(var(--grid-color, #000) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color, #000) 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
                ['--grid-color' as string]: forceDarkMode ? '#fff' : undefined
            }}
        />

        {/* Gradient overlay - dark in dark mode or when forced, light in light mode */}
        <div className={forceDarkMode ? "absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-transparent to-transparent" : "absolute inset-0 bg-gradient-to-t from-[#0B0C0E] dark:from-[#0B0C0E] from-white via-transparent to-transparent"} />
    </div>
);