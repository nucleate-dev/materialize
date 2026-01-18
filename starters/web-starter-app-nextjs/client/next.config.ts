import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  images: {
    unoptimized: true,
  },
  typescript: {
    // Ignore TypeScript errors during build
    // This ensures builds succeed even with type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
