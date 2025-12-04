import { getAllPosts } from "@/lib/blog";
import { Metadata } from "next";
import Blog from "./Blog";

export const metadata: Metadata = {
  title: "Blog | Sanara",
  description:
    "Latest insights, tutorials, and updates from the Sanara team on React Native development, AI-powered prototyping, and mobile app design.",
  keywords: [
    "React Native",
    "Mobile Development",
    "Prototyping",
    "AI",
    "App Design",
    "Blog",
  ],
  openGraph: {
    title: "Sanara Blog",
    description:
      "Latest insights, tutorials, and updates from the Sanara team",
    type: "website",
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <Blog initialPosts={posts} />;
}
