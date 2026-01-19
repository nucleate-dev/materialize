import { getAllPosts } from "@/lib/blog";
import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://nucleate.dev";
  const posts = getAllPosts();

  const blogUrls = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.publishedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const routes = [
    "",
    "/blog",
    "/for-vibe-coding",
    "/privacy-policy",
    "/terms-and-conditions",
    "/faqs",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date().toISOString().split("T")[0],
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : 0.8,
  }));

  return [...routes, ...blogUrls];
}
