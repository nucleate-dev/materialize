import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const postsDirectory = path.join(process.cwd(), "src/content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  authorAvatar: string;
  publishedAt: string;
  readTime: number;
  tags: string[];
  category: "tutorial" | "insights" | "updates" | "tips";
  featured: boolean;
}

export interface BlogPostFrontmatter {
  title: string;
  excerpt: string;
  author: string;
  authorAvatar: string;
  publishedAt: string;
  tags: string[];
  category: "tutorial" | "insights" | "updates" | "tips";
  featured?: boolean;
}

export function getAllPosts(): BlogPost[] {
  // Check if directory exists
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = fileNames
    .filter((name) => name.endsWith(".mdx"))
    .map((fileName) => {
      const slug = fileName.replace(/\.mdx$/, "");
      const fullPath = path.join(postsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");

      // Use gray-matter to parse the post metadata section
      const matterResult = matter(fileContents);
      const frontmatter = matterResult.data as BlogPostFrontmatter;

      // Calculate reading time
      const stats = readingTime(matterResult.content);

      return {
        slug,
        title: frontmatter.title,
        excerpt: frontmatter.excerpt,
        content: matterResult.content,
        author: frontmatter.author,
        authorAvatar: frontmatter.authorAvatar,
        publishedAt: frontmatter.publishedAt,
        readTime: Math.ceil(stats.minutes),
        tags: frontmatter.tags,
        category: frontmatter.category,
        featured: frontmatter.featured || false,
      } as BlogPost;
    });

  // Sort posts by date
  return allPostsData.sort((a, b) => {
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });
}

export function getPostBySlug(slug: string): BlogPost | null {
  try {
    const fullPath = path.join(postsDirectory, `${slug}.mdx`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const matterResult = matter(fileContents);
    const frontmatter = matterResult.data as BlogPostFrontmatter;

    const stats = readingTime(matterResult.content);

    return {
      slug,
      title: frontmatter.title,
      excerpt: frontmatter.excerpt,
      content: matterResult.content,
      author: frontmatter.author,
      authorAvatar: frontmatter.authorAvatar,
      publishedAt: frontmatter.publishedAt,
      readTime: Math.ceil(stats.minutes),
      tags: frontmatter.tags,
      category: frontmatter.category,
      featured: frontmatter.featured || false,
    };
  } catch {
    return null;
  }
}

export function getFeaturedPosts(): BlogPost[] {
  return getAllPosts().filter((post) => post.featured);
}

export function getPostsByCategory(category: string): BlogPost[] {
  if (category === "all") {
    return getAllPosts();
  }
  return getAllPosts().filter((post) => post.category === category);
}

export function searchPosts(query: string): BlogPost[] {
  const allPosts = getAllPosts();
  const lowercaseQuery = query.toLowerCase();

  return allPosts.filter(
    (post) =>
      post.title.toLowerCase().includes(lowercaseQuery) ||
      post.excerpt.toLowerCase().includes(lowercaseQuery) ||
      post.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery)) ||
      post.content.toLowerCase().includes(lowercaseQuery),
  );
}
