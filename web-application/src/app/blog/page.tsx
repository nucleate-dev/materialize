import { getAllPosts } from "@/lib/blog";
import { Metadata } from "next";
import Blog from "./Blog";

export const metadata: Metadata = {
  title: "Blog | Nucleate",
  description:
    "Latest insights, tutorials, and updates from the Nucleate team on React Native development, AI-powered prototyping, and mobile app design.",
  keywords: [
    "React Native",
    "Mobile Development",
    "Prototyping",
    "AI",
    "App Design",
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
