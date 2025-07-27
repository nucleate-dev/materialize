"use client";

import { supabase } from "@/GlobalConstants";
import { User } from "@supabase/supabase-js";
import { useState } from "react";

interface NewWhiteboardModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: () => void;
}

export default function NewWhiteboardModal({
  open,
  onClose,
  user,
  onCreated,
}: NewWhiteboardModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);
    try {
      const { data: canvas, error } = await supabase
        .from("canvases")
        .insert({
          owner_id: user.id,
          name,
          description,
          thumbnail_url:
            "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop&crop=center",
        })
        .select()
        .single();
      if (error) {
        console.error("Error creating canvas:", error);
        // TODO: Show error toast/notification
        return;
      }
      if (canvas) {
        onCreated();
        onClose();
      }
    } catch (error) {
      console.error("Error creating canvas:", error);
      // TODO: Show error toast/notification
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md relative animate-fadeInUp">
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white text-center">
          Create New Whiteboard
        </h2>
        <p className="mb-6 text-gray-500 dark:text-gray-300 text-center">
          Give your whiteboard a name and description to get started.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Whiteboard Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white ${touched && !name.trim() ? "border-red-500 ring-red-200" : ""}`}
              placeholder="e.g. Marketing Plan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={64}
            />
            {touched && !name.trim() && (
              <span className="text-xs text-red-500 mt-1 block">
                Name is required.
              </span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Description
            </label>
            <textarea
              className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white resize-none min-h-[60px]"
              placeholder="Describe your canvas (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
            />
          </div>
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-lg flex items-center justify-center gap-2"
          >
            {isCreating && (
              <svg
                className="animate-spin h-5 w-5 mr-2 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isCreating ? "Creating..." : "Create Canvas"}
          </button>
        </form>
      </div>
      <style jsx>{`
        .animate-fadeInUp {
          animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}