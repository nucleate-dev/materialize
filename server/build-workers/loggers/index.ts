// Centralized logger instances for the build worker
// Import these in services instead of passing through constructors
import dotenv from "dotenv";
import { PostHog } from "posthog-node";
import { PostHogLogger } from "./PostHogLogger.js";
import { SystemLogger } from "./SystemLogger.js";

// Load environment variables
dotenv.config();

// Initialize PostHog client (singleton)
export const posthog = new PostHog(process.env.POSTHOG_KEY!, {
  host: process.env.POSTHOG_HOST!,
});

// Initialize SystemLogger with PostHog integration
export const baseLogger = new SystemLogger({
  service: "build-worker",
  env: process.env.NODE_ENV || "development",
  metricNamespace: "Materialize/BuildWorker",
  redactKeys: ["authorization", "cookie", "x-api-key"],
  posthog,
});

// Initialize PostHogLogger
export const posthogLogger = new PostHogLogger({
  posthog,
  context: {
    server: "sandbox-fargate",
    env: process.env.NODE_ENV || "development",
  },
});
