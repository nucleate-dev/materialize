import { getAllPosts } from "@/lib/blog";
import { Metadata } from "next";
import Blog from "./Blog";

export const metadata: Metadata = {
  title: "Blog | Nucleate",
  description:
    "Latest insights, tutorials, and updates from the Nucleate team on design engineering, product engineering, and rapid prototyping.",
  keywords: [
    "Design Engineering",
    "Product Engineering",
    "Prototyping",
    "AI",
    "UI/UX",
    "Blog",
  ],
  openGraph: {
    title: "Nucleate Blog",
    description:
      "Latest insights, tutorials, and updates from the Nucleate team",
    type: "website",
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <Blog initialPosts={posts} />;
}
