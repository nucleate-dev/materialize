/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["web-starter-pack"],
};

module.exports = nextConfig;
