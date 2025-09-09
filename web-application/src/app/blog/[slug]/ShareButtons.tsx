"use client";

import { Button } from "@/components/ui/button";
import { Twitter, Linkedin, Link as LinkIcon } from "lucide-react";
import { useState } from "react";

interface ShareButtonsProps {
  title: string;
}

export default function ShareButtons({ title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL');
    }
  };

  const shareUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : '';
  const shareTitle = encodeURIComponent(title);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={copyToClipboard}
        className="flex items-center gap-2"
      >
        <LinkIcon className="w-4 h-4" />
        {copied ? 'Copied!' : 'Copy Link'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        asChild
      >
        <a
          href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
        >
          <Twitter className="w-4 h-4" />
          Tweet
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        asChild
      >
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
        >
          <Linkedin className="w-4 h-4" />
          Share
        </a>
      </Button>
    </div>
  );
}