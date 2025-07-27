"use client";

import React from "react";

interface EmptyStateProps {
  type: "projects" | "prototypes" | "whiteboards";
  title?: string;
  description?: string;
  buttonText?: string;
  onButtonClick?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  buttonText,
  onButtonClick,
}) => {
  // Default content based on type
  const defaultContent = {
    projects: {
      title: "No projects yet",
      description: "Create your first project to start prototyping your ideas at the speed of thought.",
      buttonText: "Create First Project",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      ),
    },
    prototypes: {
      title: "No prototypes yet",
      description: "Create your first prototype to start prototyping your ideas at the speed of thought.",
      buttonText: "Create First Prototype",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      ),
    },
    whiteboards: {
      title: "No whiteboards yet",
      description: "Create your first infinite canvas to start prototyping and designing at the speed of thought.",
      buttonText: "Create First Whiteboard",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      ),
    },
  };

  const content = defaultContent[type];
  const finalTitle = title || content.title;
  const finalDescription = description || content.description;
  const finalButtonText = buttonText || content.buttonText;

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-24 h-24 bg-gray-100 dark:bg-meta-4 rounded-full flex items-center justify-center mb-6">
        <svg
          className="w-12 h-12 text-body dark:text-bodydark2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {content.icon}
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
        {finalTitle}
      </h3>
      <p className="text-body dark:text-bodydark mb-6 max-w-md">
        {finalDescription}
      </p>
      {onButtonClick && (
        <button
          onClick={onButtonClick}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200"
        >
          {finalButtonText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;