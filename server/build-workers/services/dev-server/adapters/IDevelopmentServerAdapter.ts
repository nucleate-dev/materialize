import { SystemLogger } from "../../../loggers/SystemLogger.js";
import {
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";

/**
 * Type definition for supported development server frameworks.
 */
export type DevelopmentServerType = "expo-react-native" | "nextjs-web";

/**
 * Interface for development server services.
 * Defines the core operations that all dev server implementations must support.
 */
export interface IDevelopmentServerAdapter {
  /**
   * The type of development server (e.g., "expo-react-native" or "nextjs-web").
   * Must be defined by implementing classes.
   */
  readonly serverType: DevelopmentServerType;

  /**
   * Starts the development server.
   */
  startDevServer(
    log2: SystemLogger,
  ): Promise<SandboxAPIResponse<{ tunnel_url: string }, StandardErrorResponse>>;

  /**
   * Restarts the development server.
   */
  restartDevServer(log2: SystemLogger): Promise<void>;

  /**
   * Builds the project.
   */
  build(
    log2: SystemLogger,
  ): Promise<
    SandboxAPIResponse<{ output_path: string }, StandardErrorResponse>
  >;

  /**
   * Shuts down the development server and cleans up resources.
   */
  stopDevServer(log2: SystemLogger): Promise<void>;
}
