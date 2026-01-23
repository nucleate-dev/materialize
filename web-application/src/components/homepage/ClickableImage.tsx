"use client";

import Image from "next/image";
import { useState } from "react";
import ImageModal from "./ImageModal";

interface ClickableImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  hoverColor?: string;
}

export default function ClickableImage({
  src,
  alt,
  width,
  height,
  priority,
  hoverColor = "primary",
}: ClickableImageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hoverColorClass =
    hoverColor === "purple"
      ? "hover:shadow-purple-500/20 hover:border-purple-500/50"
      : hoverColor === "emerald"
        ? "hover:shadow-emerald-500/20 hover:border-emerald-500/50"
        : "hover:shadow-primary/20 hover:border-primary/50";

  return (
    <>
      <div
        className="relative group cursor-pointer"
        onClick={() => setIsModalOpen(true)}
      >
        <div
          className={`rounded-2xl border-2 border-border overflow-hidden bg-card shadow-2xl transition-all duration-300 ${hoverColorClass}`}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="w-full h-auto"
            priority={priority}
          />
        </div>
        <div className="absolute bottom-4 right-4 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </div>
      </div>

      {isModalOpen && (
        <ImageModal
          src={src}
          alt={alt}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
