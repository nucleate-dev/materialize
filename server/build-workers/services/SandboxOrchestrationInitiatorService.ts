import axios from "axios";
import { baseLogger } from "../loggers/index.js";
import { SystemLogger } from "../loggers/SystemLogger.js";

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
  private userJwtToken: string | null = null;
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
   * Set the user JWT token for this sandbox.
   * Called during allocation.
   */
  public setUserJwtToken(token: string): void {
    this.userJwtToken = token;
    this.logger.consoleLogDevOnly("info", "User JWT token set");
  }

  /**
   * Get the current orchestration token.
   */
  public getOrchestrationToken(): string | null {
    return this.orchestrationToken;
  }

  /**
   * Get the current user JWT token.
   */
  public getUserJwtToken(): string | null {
    return this.userJwtToken;
  }

  /**
   * Refresh the GitHub installation token for the given prototype.
   * Makes a request to the control plane orchestration endpoint.
   *
   * @param prototypeId - The prototype ID to get a GitHub installation token for
   * @returns The installation token and expiration date
   * @throws Error if the request fails or tokens are not set
   */
  public async refreshGitHubInstallationToken(prototypeId: string): Promise<{
    installation_token: string;
    expires_at: string;
  }> {
    if (!this.orchestrationToken) {
      throw new Error("Orchestration token not set");
    }

    if (!this.userJwtToken) {
      throw new Error("User JWT token not set");
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
            Authorization: `Bearer ${this.userJwtToken}`,
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
}
