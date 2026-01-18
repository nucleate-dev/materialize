import axios from "axios";
import { baseLogger } from "../loggers/index.js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  APIResponse,
  EndChatResponse,
  StandardErrorResponse,
  StartChatResponse,
} from "../types/ControlPlaneTypes.js";

interface RefreshGitHubInstallationTokenResponse {
  data: {
    installation_token: string;
    expires_at: string;
  } | null;
  error: {
    error: string;
    message: string;
  } | null;
}

/**
 * Service for making orchestration calls from the sandbox to the control plane.
 * Manages authentication tokens and makes requests to orchestration endpoints.
 */
export class SandboxOrchestrationInitiatorService {
  private orchestrationToken: string | null = null;
  private logger: SystemLogger;

  constructor() {
    this.logger = baseLogger.child({
      service: "SandboxOrchestrationInitiatorService",
    });
  }

  /**
   * Set the orchestration token for this sandbox.
   * Called during allocation.
   */
  public setOrchestrationToken(token: string): void {
    this.orchestrationToken = token;
    this.logger.consoleLogDevOnly("info", "Orchestration token set");
  }

  /**
   * Get the current orchestration token.
   */
  public getOrchestrationToken(): string | null {
    return this.orchestrationToken;
  }

  /**
   * Refresh the GitHub installation token for the given prototype.
   * Makes a request to the control plane orchestration endpoint.
   *
   * @param prototypeId - The prototype ID to get a GitHub installation token for
   * @param userJwtToken - The user's JWT token (get fresh token from SupabaseClientService)
   * @returns The installation token and expiration date
   * @throws Error if the request fails or tokens are not set
   */
  public async refreshGitHubInstallationToken(
    prototypeId: string,
    userJwtToken: string,
  ): Promise<{
    installation_token: string;
    expires_at: string;
  }> {
    if (!this.orchestrationToken) {
      throw new Error("Orchestration token not set");
    }

    const serverEndpoint = process.env.NUCLEATE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      throw new Error("NUCLEATE_SERVER_ENDPOINT not set in environment");
    }

    try {
      const response = await axios.post<RefreshGitHubInstallationTokenResponse>(
        `${serverEndpoint}/orchestration/refresh-github-installation-token`,
        {
          prototype_id: prototypeId,
        },
        {
          headers: {
            "x-orchestration-token": this.orchestrationToken,
            Authorization: `Bearer ${userJwtToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 second timeout
        },
      );

      if (response.data.error) {
        throw new Error(
          `Failed to refresh GitHub installation token: ${response.data.error.message}`,
        );
      }

      if (!response.data.data) {
        throw new Error(
          "Failed to refresh GitHub installation token: No data returned",
        );
      }

      this.logger.info("Successfully refreshed GitHub installation token", {
        prototypeId,
        expiresAt: response.data.data.expires_at,
      });

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error?.message ||
          error.message ||
          "Unknown error";
        const statusCode = error.response?.status;

        this.logger.error(
          new Error(errorMessage),
          "Failed to refresh GitHub installation token",
          {
            prototypeId,
            statusCode,
            errorData: error.response?.data,
          },
        );

        throw new Error(
          `Failed to refresh GitHub installation token: ${errorMessage} (status: ${statusCode})`,
        );
      }

      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to refresh GitHub installation token",
        { prototypeId },
      );

      throw error;
    }
  }

  /**
   * Notifies the control plane that a chat session has started.
   */
  public async notifyOrchestrationStartChat(
    prototypeId: string,
  ): Promise<void> {
    const serverEndpoint = process.env.NUCLEATE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      this.logger.warn(
        "NUCLEATE_SERVER_ENDPOINT not set, skipping start-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      this.logger.error(
        new Error("Orchestration token not set"),
        "Cannot notify start-chat without orchestration token",
        { prototypeId },
      );
      return;
    }

    try {
      const response = await axios.post<
        APIResponse<StartChatResponse, StandardErrorResponse>
      >(
        `${serverEndpoint}/orchestration/start-chat`,
        { prototype_id: prototypeId },
        {
          headers: {
            "x-orchestration-token": this.orchestrationToken,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );
      const payload = response.data;

      if (payload.error || !payload.data?.success) {
        const errorMessage = payload.error
          ? `Control plane rejected start-chat: ${payload.error.message}`
          : "Control plane returned an invalid start-chat response";
        const err = new Error(errorMessage) as Error & {
          responseBody?: APIResponse<StartChatResponse, StandardErrorResponse>;
        };
        err.responseBody = payload;
        throw err;
      }

      this.logger.consoleLogDevOnly(
        "info",
        "Notified control plane of chat start",
        {
          prototypeId,
          responseMessage: payload.data.message,
        },
      );
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const derivedError = axiosError
        ? new Error(
            `Failed to notify control plane of chat start (status ${
              axiosError.response?.status ?? "unknown"
            })`,
          )
        : error instanceof Error
          ? error
          : new Error(String(error));
      const responseBody =
        (error as { responseBody?: unknown })?.responseBody ??
        axiosError?.response?.data;

      this.logger.error(
        derivedError,
        "Failed to notify control plane of chat start",
        {
          prototypeId,
          statusCode: axiosError?.response?.status,
          responseBody,
        },
      );
      throw derivedError;
    }
  }

  /**
   * Notifies the control plane that a chat session has ended.
   * CRITICAL: This method must ALWAYS be called at the end of every chat session,
   * regardless of success or failure. The control plane relies on this notification
   * to properly manage container state and resource allocation. If this call fails,
   * it will be retried to ensure the control plane receives the notification.
   */
  public async notifyOrchestrationEndChat(prototypeId: string): Promise<void> {
    const serverEndpoint = process.env.NUCLEATE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      this.logger.warn(
        "NUCLEATE_SERVER_ENDPOINT not set, skipping end-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      this.logger.error(
        new Error("Orchestration token not set"),
        "Cannot notify end-chat without orchestration token",
        { prototypeId },
      );
      return;
    }

    // Retry logic to ensure this critical notification succeeds
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post<
          APIResponse<EndChatResponse, StandardErrorResponse>
        >(
          `${serverEndpoint}/orchestration/end-chat`,
          { prototype_id: prototypeId },
          {
            headers: {
              "x-orchestration-token": this.orchestrationToken,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          },
        );
        const payload = response.data;

        if (payload.error || !payload.data?.success) {
          const errorMessage = payload.error
            ? `Control plane rejected end-chat: ${payload.error.message}`
            : "Control plane returned an invalid end-chat response";
          const err = new Error(errorMessage) as Error & {
            responseBody?: APIResponse<EndChatResponse, StandardErrorResponse>;
          };
          err.responseBody = payload;
          throw err;
        }

        this.logger.consoleLogDevOnly(
          "info",
          "Notified control plane of chat end",
          {
            prototypeId,
            attempt,
            responseMessage: payload.data.message,
          },
        );
        return; // Success - exit the function
      } catch (error) {
        const axiosError = axios.isAxiosError(error) ? error : null;
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          lastError,
          `Failed to notify control plane of chat end (attempt ${attempt}/${maxRetries})`,
          {
            prototypeId,
            statusCode: axiosError?.response?.status,
            responseBody:
              (error as { responseBody?: unknown })?.responseBody ??
              axiosError?.response?.data,
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
    this.logger.error(
      lastError || new Error("Unknown error"),
      "CRITICAL: Failed to notify control plane of chat end after all retries",
      { prototypeId, maxRetries },
    );
  }
}
