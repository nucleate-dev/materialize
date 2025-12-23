"use client";

import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js/react";
import type { PostHogEvent } from "./PostHogEvents";

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
  event: PostHogEvent;
  properties?: ProductLogProperties;
  /**
   * Optional sampling rate (0-1). Values less than 1 will randomly drop events client-side.
   */
  sampleRate?: number;
}

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 25;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 3;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return undefined;
  }

  switch (typeof value) {
    case "string":
      return value.length > MAX_STRING_LENGTH
        ? `${value.slice(0, MAX_STRING_LENGTH)}…`
        : value;
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "function":
    case "symbol":
    case "undefined":
      return undefined;
    case "object":
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (Array.isArray(value)) {
        return value
          .slice(0, MAX_ARRAY_LENGTH)
          .map((item) => sanitizeValue(item, depth + 1))
          .filter((item) => item !== undefined);
      }

      const sanitizedObj: Record<string, unknown> = {};
      let keyCount = 0;
      for (const [key, val] of Object.entries(value)) {
        if (keyCount >= MAX_OBJECT_KEYS) break;
        const sanitizedVal = sanitizeValue(val, depth + 1);
        if (sanitizedVal !== undefined) {
          sanitizedObj[key] = sanitizedVal;
          keyCount += 1;
        }
      }
      return sanitizedObj;
    default:
      return undefined;
  }
}

export class ClientProductLogger {
  private posthog: PostHog | null;
  private isDev: boolean;

  constructor(posthog?: PostHog) {
    this.posthog = posthog || null;
    this.isDev = process.env.NODE_ENV === "development";
  }

  debug(
    level: LogLevel = "log",
    message: string,
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
    const { sampleRate, properties } = eventData;

    if (typeof sampleRate === "number") {
      if (sampleRate <= 0) {
        return;
      }
      if (sampleRate < 1 && Math.random() > sampleRate) {
        return;
      }
    }

    if (!this.posthog) {
      if (this.isDev) {
        console.warn("PostHog not initialized, cannot log event:", eventData);
      }
      return;
    }

    const sanitizedProps =
      properties !== undefined
        ? (sanitizeValue(properties) as ProductLogProperties | undefined)
        : undefined;

    // Log to PostHog
    if (this.posthog) {
      this.posthog.capture(eventData.event, sanitizedProps);
    }

    // Also log to console in development
    if (this.isDev) {
      console.log("PostHog Event:", eventData.event, sanitizedProps);
    }
  }
}

// Hook for easy usage in React components
export function useProductLogger(): ClientProductLogger {
  const posthog = usePostHog();
  return useMemo(() => new ClientProductLogger(posthog), [posthog]);
}
