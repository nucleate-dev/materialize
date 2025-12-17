import { SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { Database } from '../../types/supabase.js';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

interface UserClaudeToken {
  id: string;
  user_id: string;
  oauth_token: string;
  token_type: string;
  is_valid: boolean;
  last_used_at: string | null;
  last_validated_at: string | null;
  validation_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Service for managing Claude Code OAuth tokens for users.
 * Handles storing, retrieving, and validating tokens from the database.
 */
export class ClaudeTokenService {
  private readonly supabase: SupabaseClient<Database>;
  private readonly logger: SystemLogger;
  private tokenCache = new Map<string, TokenCacheEntry>();
  private cleanupInterval: NodeJS.Timeout;

  // Cache tokens for 5 minutes to reduce DB calls
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(supabase: SupabaseClient<Database>, logger: SystemLogger) {
    this.supabase = supabase;
    this.logger = logger.child({ service: 'ClaudeTokenService' });

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
      this.logger.debug('Token retrieved from cache', { userId });
      return cached.token;
    }

    // Fetch from database
    try {
      const { data, error } = await this.supabase
        .from('user_claude_tokens')
        .select('oauth_token, is_valid')
        .eq('user_id', userId)
        .eq('is_valid', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user doesn't have a token
          this.logger.debug('No token found for user', { userId });
          return null;
        }
        throw error;
      }

      if (!data || !data.oauth_token) {
        this.logger.debug('No valid token found for user', { userId });
        return null;
      }

      // Cache the token
      this.tokenCache.set(userId, {
        token: data.oauth_token,
        expiresAt: Date.now() + ClaudeTokenService.CACHE_TTL_MS,
      });

      // Update last_used_at timestamp (fire and forget)
      void this.updateLastUsed(userId);

      this.logger.debug('Token retrieved from database', { userId });
      return data.oauth_token;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to retrieve user token',
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
        throw new Error('Invalid token format');
      }

      const now = new Date().toISOString();

      // Upsert the token
      const { error } = await this.supabase
        .from('user_claude_tokens')
        .upsert({
          user_id: userId,
          oauth_token: token,
          token_type: 'setup-token',
          is_valid: true,
          last_validated_at: now,
          validation_error: null,
          updated_at: now,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        throw error;
      }

      // Update cache
      this.tokenCache.set(userId, {
        token,
        expiresAt: Date.now() + ClaudeTokenService.CACHE_TTL_MS,
      });

      this.logger.info('Token saved successfully', { userId });
      return true;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to save user token',
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
        .from('user_claude_tokens')
        .update({
          is_valid: false,
          validation_error: validationError || 'Token validation failed',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      // Remove from cache
      this.tokenCache.delete(userId);

      this.logger.warn('Token marked as invalid', {
        userId,
        validationError,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to mark token as invalid',
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
        .from('user_claude_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      // Remove from cache
      this.tokenCache.delete(userId);

      this.logger.info('Token deleted successfully', { userId });
      return true;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to delete user token',
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
        .from('user_claude_tokens')
        .update({
          last_used_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch (error) {
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

    for (const [userId, entry] of this.tokenCache.entries()) {
      if (entry.expiresAt < now) {
        this.tokenCache.delete(userId);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Cleaned up expired token cache entries', { removed });
    }
  }

  /**
   * Clear all cached tokens
   */
  clearCache(): void {
    this.tokenCache.clear();
    this.logger.debug('Token cache cleared');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokenCache.clear();
    this.logger.debug('ClaudeTokenService destroyed');
  }
}
