import axios from "axios";
import { SystemLogger } from "../loggers/SystemLogger.js";

/**
 * Utility functions for notifying the control plane (orchestration service)
 * about chat session lifecycle events.
 *
 * These notifications are critical for proper container state management,
 * resource allocation, and cleanup operations in the distributed system.
 */

/**
 * Notifies the control plane that a chat session has started.
 * This notification is best-effort and will not block chat execution if it fails.
 */
export async function notifyOrchestrationStartChat(
  prototypeId: string,
  orchestrationToken: string | null,
  logger: SystemLogger,
): Promise<void> {
  const serverEndpoint = process.env.MATERIALIZE_SERVER_ENDPOINT;

  if (!serverEndpoint) {
    logger.warn(
      "MATERIALIZE_SERVER_ENDPOINT not set, skipping start-chat notification",
    );
    return;
  }

  if (!orchestrationToken) {
    logger.error(
      new Error("Orchestration token not set"),
      "Cannot notify start-chat without orchestration token",
      { prototypeId },
    );
    return;
  }

  try {
    await axios.post(
      `${serverEndpoint}/orchestration/start-chat`,
      { prototype_id: prototypeId },
      {
        headers: {
          "x-orchestration-token": orchestrationToken,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );
    logger.consoleLogDevOnly(
      "info",
      "Notified control plane of chat start",
      { prototypeId },
    );
  } catch (error) {
    const axiosError = axios.isAxiosError(error) ? error : null;
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to notify control plane of chat start",
      {
        prototypeId,
        statusCode: axiosError?.response?.status,
        responseBody: axiosError?.response?.data,
      },
    );
    // Don't throw - we want the chat to proceed even if notification fails
  }
}

/**
 * Notifies the control plane that a chat session has ended.
 *
 * CRITICAL: This function must ALWAYS be called at the end of every chat session,
 * regardless of success or failure. The control plane relies on this notification
 * to properly manage container state and resource allocation.
 *
 * This function includes retry logic with exponential backoff to ensure the
 * notification is delivered even in the face of transient network issues.
 *
 * @param prototypeId - The ID of the prototype whose chat session has ended
 * @param orchestrationToken - Authentication token for the orchestration service
 * @param logger - Logger instance for tracking notification attempts
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export async function notifyOrchestrationEndChat(
  prototypeId: string,
  orchestrationToken: string | null,
  logger: SystemLogger,
  maxRetries: number = 3,
): Promise<void> {
  const serverEndpoint = process.env.MATERIALIZE_SERVER_ENDPOINT;

  if (!serverEndpoint) {
    logger.warn(
      "MATERIALIZE_SERVER_ENDPOINT not set, skipping end-chat notification",
    );
    return;
  }

  if (!orchestrationToken) {
    logger.error(
      new Error("Orchestration token not set"),
      "Cannot notify end-chat without orchestration token",
      { prototypeId },
    );
    return;
  }

  // Retry logic to ensure this critical notification succeeds
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(
        `${serverEndpoint}/orchestration/end-chat`,
        { prototype_id: prototypeId },
        {
          headers: {
            "x-orchestration-token": orchestrationToken,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );
      logger.consoleLogDevOnly(
        "info",
        "Notified control plane of chat end",
        {
          prototypeId,
          attempt,
        },
      );
      return; // Success - exit the function
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(
        lastError,
        `Failed to notify control plane of chat end (attempt ${attempt}/${maxRetries})`,
        {
          prototypeId,
          statusCode: axiosError?.response?.status,
          responseBody: axiosError?.response?.data,
        },
      );

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100),
        );
      }
    }
  }

  // If we get here, all retries failed
  logger.error(
    lastError || new Error("Unknown error"),
    "CRITICAL: Failed to notify control plane of chat end after all retries",
    { prototypeId, maxRetries },
  );
}

/**
 * Creates bound notifier functions that can be passed to other services.
 * This is useful for dependency injection patterns.
 */
export function createOrchestrationNotifiers(
  orchestrationToken: string | null,
  logger: SystemLogger,
): {
  notifyStartChat: (prototypeId: string) => Promise<void>;
  notifyEndChat: (prototypeId: string) => Promise<void>;
} {
  return {
    notifyStartChat: async (prototypeId: string): Promise<void> => {
      await notifyOrchestrationStartChat(
        prototypeId,
        orchestrationToken,
        logger,
      );
    },
    notifyEndChat: async (prototypeId: string): Promise<void> => {
      await notifyOrchestrationEndChat(prototypeId, orchestrationToken, logger);
    },
  };
}
