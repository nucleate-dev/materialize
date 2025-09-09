import { Metadata } from 'next';
import { getAllPosts } from '@/lib/blog';
import Blog from './Blog';

export const metadata: Metadata = {
  title: 'Blog | Materialize',
  description: 'Latest insights, tutorials, and updates from the Materialize team on React Native development, AI-powered prototyping, and mobile app design.',
  keywords: ['React Native', 'Mobile Development', 'Prototyping', 'AI', 'App Design', 'Blog'],
  openGraph: {
    title: 'Materialize Blog',
    description: 'Latest insights, tutorials, and updates from the Materialize team',
    type: 'website',
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <Blog initialPosts={posts} />;
}