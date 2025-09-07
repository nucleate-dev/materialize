"use client";

import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js/react";

export type LogLevel = "log" | "warn" | "error";

export interface ProductLogProperties {
  source: string;
  functionName?: string;
  fileName?: string;
  component?: string;
  userId?: string;
  // Specific event data
  action?: string;
  page?: string;
  feature?: string;
  // Additional flexible data
  additionalData?: Record<string, unknown>;
  [key: string]: unknown; // Allow any additional properties
}

export interface ProductLogEvent {
  event: string;
  properties?: ProductLogProperties;
}

export class ClientProductLogger {
  private posthog: PostHog | null;
  private isDev: boolean;

  constructor(posthog?: PostHog) {
    this.posthog = posthog || null;
    this.isDev = process.env.NODE_ENV === "development";
  }

  debug(
    message: string,
    level: LogLevel = "log",
    additionalData?: Record<string, unknown>,
  ): void {
    if (!this.isDev) return;

    const logData = additionalData ? { message, ...additionalData } : message;

    switch (level) {
      case "error":
        console.error(logData);
        break;
      case "warn":
        console.warn(logData);
        break;
      case "log":
      default:
        console.log(logData);
        break;
    }
  }

  log(eventData: ProductLogEvent): void {
    if (!this.posthog) {
      if (this.isDev) {
        console.warn("PostHog not initialized, cannot log event:", eventData);
      }
      return;
    }

    // Log to PostHog
    if (this.posthog) {
      this.posthog.capture(eventData.event, eventData.properties);
    }

    // Also log to console in development
    if (this.isDev) {
      console.log("PostHog Event:", eventData.event, eventData.properties);
    }
  }
}

// Hook for easy usage in React components
export function useProductLogger(): ClientProductLogger {
  const posthog = usePostHog();
  return new ClientProductLogger(posthog);
}
