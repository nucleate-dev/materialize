import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../../types/supabase.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import type { APIResponse, StandardErrorResponse } from '../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../utils/prototypeAuth.js';

// API Key format: nuc_<random 32 bytes hex> = nuc_ + 64 chars = 68 chars total
const API_KEY_PREFIX = 'nuc_';
const API_KEY_RANDOM_BYTES = 32;

interface CreateApiKeyRequestBody {
  name: string;
  team_id: string;
  scopes?: string[];
  expires_in_days?: number;
}

interface CreateApiKeySuccessResponse {
  id: string;
  name: string;
  key: string; // Only returned once at creation!
  key_prefix: string;
  scopes: string;
  expires_at: string | null;
  created_at: string;
}

interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface ListApiKeysSuccessResponse {
  keys: ApiKeyListItem[];
}

interface RevokeApiKeySuccessResponse {
  success: true;
  message: string;
}

// Available scopes
const VALID_SCOPES = [
  'prototypes:read',
  'prototypes:write',
  'files:read',
  'files:write',
  'dev-server:control',
] as const;

const DEFAULT_SCOPES = VALID_SCOPES.join(',');

export class ApiKeyService {
  private supabaseUrl: string;
  private supabaseServiceKey: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      throw new Error(
        'Missing required Supabase environment variables for ApiKeyService',
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    // Create a new API key
    app.post<{ Body: CreateApiKeyRequestBody }>(
      '/api-keys/create',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name', 'team_id'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              team_id: { type: 'string', format: 'uuid' },
              scopes: {
                type: 'array',
                items: { type: 'string' },
              },
              expires_in_days: { type: 'number', minimum: 1, maximum: 365 },
            },
          },
        },
      },
      this.handleCreateApiKey.bind(this),
    );

    // List user's API keys
    app.get<{ Querystring: { team_id?: string } }>(
      '/api-keys/list',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              team_id: { type: 'string', format: 'uuid' },
            },
          },
        },
      },
      this.handleListApiKeys.bind(this),
    );

    // Revoke an API key
    app.delete<{ Params: { key_id: string } }>(
      '/api-keys/:key_id',
      {
        schema: {
          params: {
            type: 'object',
            required: ['key_id'],
            properties: {
              key_id: { type: 'string', format: 'uuid' },
            },
          },
        },
      },
      this.handleRevokeApiKey.bind(this),
    );
  }

  private async handleCreateApiKey(
    request: FastifyRequest<{ Body: CreateApiKeyRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<CreateApiKeySuccessResponse, StandardErrorResponse>> {
    const token = request.headers.authorization?.split(' ')[1];
    const { user } = await validateJWTToken(token, request.log2);

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: { error: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }

    const { name, team_id, scopes, expires_in_days } = request.body;

    // Validate scopes if provided
    if (scopes) {
      const invalidScopes = scopes.filter(
        (s) => !VALID_SCOPES.includes(s as (typeof VALID_SCOPES)[number]),
      );
      if (invalidScopes.length > 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: 'INVALID_SCOPES',
            message: `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${VALID_SCOPES.join(', ')}`,
          },
        });
      }
    }

    try {
      // Use service role to check team membership and create key
      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      // Verify user is a member of the team
      // Note: Using 'as any' until api_keys table migration is run and types regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: membership, error: membershipError } = await (supabase as any)
        .from('team_memberships')
        .select('id')
        .eq('team_id', team_id)
        .eq('user_id', user.id)
        .single();

      if (membershipError || !membership) {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          data: null,
          error: {
            error: 'FORBIDDEN',
            message: 'You are not a member of this team',
          },
        });
      }

      // Generate the API key
      const randomBytes = crypto.randomBytes(API_KEY_RANDOM_BYTES);
      const keyValue = API_KEY_PREFIX + randomBytes.toString('hex');
      const keyHash = crypto.createHash('sha256').update(keyValue).digest('hex');
      const keyPrefix = keyValue.substring(0, 12); // nuc_XXXX

      // Calculate expiration
      let expiresAt: string | null = null;
      if (expires_in_days) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + expires_in_days);
        expiresAt = expDate.toISOString();
      }

      // Insert the key
      // Note: Using 'as any' until api_keys table migration is run and types regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: apiKey, error: insertError } = await (supabase as any)
        .from('api_keys')
        .insert({
          user_id: user.id,
          team_id,
          name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          scopes: scopes ? scopes.join(',') : DEFAULT_SCOPES,
          expires_at: expiresAt,
        })
        .select('id, name, key_prefix, scopes, expires_at, created_at')
        .single();

      if (insertError || !apiKey) {
        request.log2.error(insertError, 'Failed to create API key');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'DATABASE_ERROR',
            message: insertError?.message || 'Failed to create API key',
          },
        });
      }

      // Return the key - this is the ONLY time the full key is returned!
      return reply.status(HTTP_STATUS.CREATED).send({
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key: keyValue, // Only returned once!
          key_prefix: apiKey.key_prefix,
          scopes: apiKey.scopes,
          expires_at: apiKey.expires_at,
          created_at: apiKey.created_at,
        },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error creating API key');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: { error: 'INTERNAL_ERROR', message },
      });
    }
  }

  private async handleListApiKeys(
    request: FastifyRequest<{ Querystring: { team_id?: string } }>,
    reply: FastifyReply,
  ): Promise<APIResponse<ListApiKeysSuccessResponse, StandardErrorResponse>> {
    const token = request.headers.authorization?.split(' ')[1];
    const { user } = await validateJWTToken(token, request.log2);

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: { error: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }

    const { team_id } = request.query;

    try {
      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      // Note: Using 'as any' until api_keys table migration is run and types regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('api_keys')
        .select('id, name, key_prefix, scopes, last_used_at, expires_at, created_at')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (team_id) {
        query = query.eq('team_id', team_id);
      }

      const { data: keys, error } = await query;

      if (error) {
        request.log2.error(error, 'Failed to list API keys');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: { error: 'DATABASE_ERROR', message: error.message },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: { keys: keys || [] },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error listing API keys');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: { error: 'INTERNAL_ERROR', message },
      });
    }
  }

  private async handleRevokeApiKey(
    request: FastifyRequest<{ Params: { key_id: string } }>,
    reply: FastifyReply,
  ): Promise<APIResponse<RevokeApiKeySuccessResponse, StandardErrorResponse>> {
    const token = request.headers.authorization?.split(' ')[1];
    const { user } = await validateJWTToken(token, request.log2);

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: { error: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }

    const { key_id } = request.params;

    try {
      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      // Update the key to set revoked_at (only if owned by user)
      // Note: Using 'as any' until api_keys table migration is run and types regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: revokedKey, error } = await (supabase as any)
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', key_id)
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .select('id')
        .single();

      if (error || !revokedKey) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          success: true,
          message: 'API key revoked successfully',
        },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error revoking API key');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: { error: 'INTERNAL_ERROR', message },
      });
    }
  }

  /**
   * Validate an API key and return the associated user info.
   * This is called during authentication to validate API keys.
   */
  public async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    userId?: string;
    teamId?: string;
    scopes?: string[];
  }> {
    if (!apiKey.startsWith(API_KEY_PREFIX)) {
      return { valid: false };
    }

    try {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      // Call the validation function
      // Note: Using 'as any' until api_keys table migration is run and types regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('validate_api_key', {
        p_key_hash: keyHash,
      });

      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        return { valid: false };
      }

      const keyInfo = Array.isArray(data) ? data[0] : data;
      return {
        valid: true,
        userId: keyInfo.user_id,
        teamId: keyInfo.team_id,
        scopes: keyInfo.scopes?.split(',') || [],
      };
    } catch {
      return { valid: false };
    }
  }
}

// Singleton instance for use in auth validation
let apiKeyServiceInstance: ApiKeyService | null = null;

export function getApiKeyService(): ApiKeyService {
  if (!apiKeyServiceInstance) {
    apiKeyServiceInstance = new ApiKeyService();
  }
  return apiKeyServiceInstance;
}
