"use client";

import { useRouter } from "next/navigation";

export default function Footer() {
  const router = useRouter();

  return (
    <footer className="py-12 border-t border-border bg-background text-sm">
      <div className="container mx-auto px-6 max-w-6xl flex flex-col md:flex-row justify-between items-center text-muted-foreground gap-6">
        <div className="flex gap-6">
          <a
            href="https://twitter.com/nucleate_dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Twitter
          </a>
          <a
            href="https://github.com/nucleate-dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://instagram.com/nucleate.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Instagram
          </a>
        </div>
        <div className="flex gap-6">
          <a
            href="mailto:team@nucleate.dev"
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Contact Us
          </a>
          <span
            onClick={() => router.push("/faqs")}
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            FAQs
          </span>
          <span
            onClick={() => router.push("/privacy-policy")}
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Privacy
          </span>
          <span
            onClick={() => router.push("/terms-and-conditions")}
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Terms
          </span>
          <span>© 2025 Nucleate</span>
        </div>
      </div>
    </footer>
  );
}
