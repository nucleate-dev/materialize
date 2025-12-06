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
  startDevServer(): void;

  /**
   * Restarts the development server.
   */
  restartDevServer(): void;

  /**
   * Builds the project.
   */
  build(): void;

  /**
   * Shuts down the development server and cleans up resources.
   */
  shutdown(): void;
}
