import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/supabase.js";
import { SystemLogger } from "../loggers/SystemLogger.js";

/**
 * Singleton service for managing Supabase client instance.
 * Provides a single source of truth for the Supabase client throughout the application.
 */
export class SupabaseClientService {
  private static instance: SupabaseClientService | null = null;
  private supabaseClient: SupabaseClient<Database>;
  private logger: SystemLogger;

  private constructor(logger: SystemLogger) {
    this.logger = logger.child({ service: "SupabaseClientService" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
      );
    }

    // Initialize with default anonymous client
    this.supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    this.logger.consoleLogDevOnly(
      "info",
      "Initialized default Supabase client",
    );
  }

  /**
   * Gets the singleton instance of SupabaseClientService.
   * Creates a new instance if one doesn't exist.
   */
  public static getInstance(logger: SystemLogger): SupabaseClientService {
    if (!SupabaseClientService.instance) {
      SupabaseClientService.instance = new SupabaseClientService(logger);
    }
    return SupabaseClientService.instance;
  }

  /**
   * Gets the current Supabase client instance
   */
  public getClient(): SupabaseClient<Database> {
    return this.supabaseClient;
  }

  /**
   * Sets a new Supabase client instance
   * @param client - The new Supabase client to use
   */
  public setClient(client: SupabaseClient<Database>): void {
    this.supabaseClient = client;
    this.logger.consoleLogDevOnly("info", "Updated Supabase client");
  }

  /**
   * Creates a Supabase client authenticated with a user's JWT token
   * @param jwtToken - The user's JWT token from the Authorization header
   * @returns Authenticated Supabase client
   */
  public createAuthenticatedClient(jwtToken: string): SupabaseClient<Database> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
      );
    }

    const authenticatedClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      },
    );

    this.logger.consoleLogDevOnly(
      "info",
      "Created authenticated Supabase client",
    );
    return authenticatedClient;
  }

  /**
   * Updates the client with an authenticated version using the provided JWT token.
   * This is a convenience method that combines createAuthenticatedClient and setClient.
   * @param jwtToken - The user's JWT token
   */
  public refreshClientWithToken(jwtToken: string): void {
    const authenticatedClient = this.createAuthenticatedClient(jwtToken);
    this.setClient(authenticatedClient);
    this.logger.consoleLogDevOnly(
      "info",
      "Refreshed Supabase client with JWT token",
    );
  }

  /**
   * Resets the client to the default anonymous client
   */
  public resetToAnonymous(): void {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    this.supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    this.logger.consoleLogDevOnly("info", "Reset Supabase client to anonymous");
  }
}
