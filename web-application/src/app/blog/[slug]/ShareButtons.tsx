// ShareButtons.tsx
"use client";

import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Check, Linkedin, Link as LinkIcon, Twitter } from "lucide-react";
import { useState } from "react";

interface ShareButtonsProps {
  title: string;
}

export default function ShareButtons({ title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const logger = useProductLogger();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      logger.debug("error", "Failed to copy URL");
    }
  };

  const shareUrl =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.href)
      : "";
  const shareTitle = encodeURIComponent(title);

  // Common button style for consistency
  const buttonClass = "h-9 px-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyToClipboard}
        className={buttonClass}
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <LinkIcon className="w-4 h-4" />}
        {copied ? "Copied" : "Copy Link"}
      </button>

      <a
        href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
      >
        <Twitter className="w-4 h-4" />
        <span className="hidden sm:inline">Tweet</span>
      </a>

      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
      >
        <Linkedin className="w-4 h-4" />
        <span className="hidden sm:inline">Share</span>
      </a>
    </div>
  );
}