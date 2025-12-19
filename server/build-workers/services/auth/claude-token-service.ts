import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";
import { baseLogger } from "../../worker.js";

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/**
 * Service for managing Claude Code OAuth tokens for users.
 * Handles storing, retrieving, and validating tokens from the database.
 */
export class ClaudeTokenService {
  private readonly supabase: SupabaseClient<Database>;
  private tokenCache = new Map<string, TokenCacheEntry>();
  private cleanupInterval: NodeJS.Timeout;

  // Cache tokens for 5 minutes to reduce DB calls
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;

    // Cleanup expired cache entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000);
  }

  /**
   * Get the OAuth token for a user, checking cache first
   */
  async getUserToken(userId: string): Promise<string | null> {
    // Check cache first
    const cached = this.tokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      baseLogger.consoleLogDevOnly("info", "Token retrieved from cache", {
        userId,
      });
      return cached.token;
    }

    // Fetch from database
    try {
      baseLogger.consoleLogDevOnly(
        "info",
        "Querying user_claude_tokens table",
        {
          userId,
          query:
            "SELECT oauth_token, is_valid WHERE user_id = ? AND is_valid = true",
        },
      );

      const { data, error } = await this.supabase
        .from("user_claude_tokens")
        .select("oauth_token, is_valid")
        .eq("user_id", userId)
        .eq("is_valid", true)
        .single();

      if (error) {
        baseLogger.consoleLogDevOnly("info", "Query error details", {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
        });

        if (error.code === "PGRST116") {
          // No rows returned - check if user has ANY token record (regardless of is_valid)
          const { data: anyToken, error: checkError } = await this.supabase
            .from("user_claude_tokens")
            .select("id, is_valid, user_id")
            .eq("user_id", userId)
            .maybeSingle();

          if (checkError) {
            baseLogger.error(
              checkError instanceof Error
                ? checkError
                : new Error(String(checkError)),
              "Error checking for any user token",
              { userId },
            );
          } else if (anyToken) {
            baseLogger.warn("User has token but is_valid = false", {
              userId,
              tokenId: anyToken.id,
              isValid: anyToken.is_valid,
            });
          } else {
            baseLogger.consoleLogDevOnly(
              "info",
              "No token record exists for user at all",
              {
                userId,
              },
            );
          }

          return null;
        }
        throw error;
      }

      if (!data || !data.oauth_token) {
        baseLogger.consoleLogDevOnly("info", "No valid token found for user", {
          userId,
        });
        return null;
      }

      // Cache the token
      this.tokenCache.set(userId, {
        token: data.oauth_token,
        expiresAt: Date.now() + ClaudeTokenService.CACHE_TTL_MS,
      });

      // Update last_used_at timestamp (fire and forget)
      void this.updateLastUsed(userId);

      baseLogger.consoleLogDevOnly("info", "Token retrieved from database", {
        userId,
      });
      return data.oauth_token;
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to retrieve user token",
        { userId },
      );
      return null;
    }
  }

  /**
   * Save or update a token for a user
   */
  async saveToken(userId: string, token: string): Promise<boolean> {
    try {
      // Validate token format
      if (!this.validateTokenFormat(token)) {
        throw new Error("Invalid token format");
      }

      const now = new Date().toISOString();

      // Upsert the token
      const { error } = await this.supabase.from("user_claude_tokens").upsert(
        {
          user_id: userId,
          oauth_token: token,
          token_type: "setup-token",
          is_valid: true,
          last_validated_at: now,
          validation_error: null,
          updated_at: now,
        },
        {
          onConflict: "user_id",
        },
      );

      if (error) {
        throw error;
      }

      // Update cache
      this.tokenCache.set(userId, {
        token,
        expiresAt: Date.now() + ClaudeTokenService.CACHE_TTL_MS,
      });

      baseLogger.info("Token saved successfully", { userId });
      return true;
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to save user token",
        { userId },
      );
      return false;
    }
  }

  /**
   * Mark a token as invalid
   */
  async markTokenInvalid(
    userId: string,
    validationError?: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_claude_tokens")
        .update({
          is_valid: false,
          validation_error: validationError || "Token validation failed",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      // Remove from cache
      this.tokenCache.delete(userId);

      baseLogger.warn("Token marked as invalid", {
        userId,
        validationError,
      });
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to mark token as invalid",
        { userId },
      );
    }
  }

  /**
   * Delete a token for a user
   */
  async deleteToken(userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("user_claude_tokens")
        .delete()
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      // Remove from cache
      this.tokenCache.delete(userId);

      baseLogger.info("Token deleted successfully", { userId });
      return true;
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to delete user token",
        { userId },
      );
      return false;
    }
  }

  /**
   * Check if a user has a valid token
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const token = await this.getUserToken(userId);
    return token !== null;
  }

  /**
   * Validate token format (basic checks)
   */
  private validateTokenFormat(token: string): boolean {
    // Token should be at least 20 characters
    if (token.length < 20) {
      return false;
    }

    // Token should not contain whitespace
    if (/\s/.test(token)) {
      return false;
    }

    // Token should only contain valid characters
    // (alphanumeric, hyphens, underscores, periods - common in JWT/OAuth tokens)
    if (!/^[A-Za-z0-9_\-\.]+$/.test(token)) {
      return false;
    }

    return true;
  }

  /**
   * Update last_used_at timestamp for a token (fire and forget)
   */
  private async updateLastUsed(userId: string): Promise<void> {
    try {
      await this.supabase
        .from("user_claude_tokens")
        .update({
          last_used_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } catch {
      // Don't log errors for this non-critical operation
      // Just fail silently
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removed = 0;

    for (const [_userId, entry] of this.tokenCache.entries()) {
      if (entry.expiresAt < now) {
        this.tokenCache.delete(_userId);
        removed++;
      }
    }

    if (removed > 0) {
      baseLogger.consoleLogDevOnly(
        "info",
        "Cleaned up expired token cache entries",
        { removed },
      );
    }
  }

  /**
   * Clear all cached tokens
   */
  clearCache(): void {
    this.tokenCache.clear();
    baseLogger.consoleLogDevOnly("info", "Token cache cleared");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokenCache.clear();
    baseLogger.consoleLogDevOnly("info", "ClaudeTokenService destroyed");
  }
}
