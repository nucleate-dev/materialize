import {
  IDevelopmentServerAdapter,
  DevelopmentServerType,
} from "./IDevelopmentServerAdapter.js";
import { TerminalService } from "../../terminals/TerminalService.js";

/**
 * Adapter for Expo React Native development server.
 * Handles starting, restarting, building, and shutting down Expo dev servers.
 */
export class ExpoReactNativeAdapter implements IDevelopmentServerAdapter {
  readonly serverType: DevelopmentServerType = "expo-react-native";
  private readonly terminalService: TerminalService;

  constructor(terminalService: TerminalService) {
    this.terminalService = terminalService;
  }

  /**
   * Starts the Expo development server.
   */
  startDevServer(): void {
    // TODO: Implement Expo dev server start logic
  }

  /**
   * Restarts the Expo development server.
   */
  restartDevServer(): void {
    // TODO: Implement Expo dev server restart logic
  }

  /**
   * Builds the Expo project.
   */
  build(): void {
    // TODO: Implement Expo project build logic
  }

  /**
   * Shuts down the Expo development server and cleans up resources.
   */
  shutdown(): void {
    // TODO: Implement Expo dev server shutdown logic
  }
}
