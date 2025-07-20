"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="py-6">
      <div
        className="flex justify-between items-center cursor-pointer text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="text-lg font-medium text-gray-800">{question}</h3>
        {isOpen ? (
          <ChevronUpIcon className="w-6 h-6 text-blue-500" />
        ) : (
          <ChevronDownIcon className="w-6 h-6 text-blue-500" />
        )}
      </div>
      {isOpen && <p className="mt-4 text-gray-600">{answer}</p>}
    </div>
  );
}
