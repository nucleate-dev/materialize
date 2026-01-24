import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines multiple class names using clsx and resolves conflicts with tailwind-merge
 * @param inputs - Class values to be merged
 * @returns Merged class string
 */
// This is commonly used throughout the app for conditional styling
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
