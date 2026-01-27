import { createClient, User } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type { Database } from '../types/supabase.js';

interface JWTPayload {
  sub?: string;
  userId?: string;
  user_id?: string;
}

// API Key prefix
const API_KEY_PREFIX = 'nuc_';

interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  teamId?: string;
  scopes?: string[];
}

/**
 * Validate an API key and return user info
 */
async function validateApiKey(
  apiKey: string,
  log2: SystemLogger,
): Promise<ApiKeyValidationResult> {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return { valid: false };
  }

  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Call the validation function
    // Note: Using 'as any' until api_keys table migration is run and types regenerated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('validate_api_key', {
      p_key_hash: keyHash,
    });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      log2.warn('API key validation failed', {
        functionName: 'validateApiKey',
        error: error?.message,
      });
      return { valid: false };
    }

    const keyInfo = Array.isArray(data) ? data[0] : data;
    return {
      valid: true,
      userId: keyInfo.user_id,
      teamId: keyInfo.team_id,
      scopes: keyInfo.scopes?.split(',') || [],
    };
  } catch (error) {
    log2.error(error, 'API key validation error', {
      functionName: 'validateApiKey',
    });
    return { valid: false };
  }
}

/**
 * Validate a JWT token or API key and return User
 * Accepts both Supabase JWT tokens and Nucleate API keys (nuc_...)
 */
export async function validateJWTToken(
  token: string | undefined,
  log2: SystemLogger,
): Promise<{ user: User | null; isServiceRole: boolean; apiKeyTeamId?: string }> {
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { user: null, isServiceRole: true };
  }

  if (!token) {
    return { user: null, isServiceRole: false };
  }

  // Check if it's an API key
  if (token.startsWith(API_KEY_PREFIX)) {
    const apiKeyResult = await validateApiKey(token, log2);
    if (apiKeyResult.valid && apiKeyResult.userId) {
      // Fetch the user object for the API key's user
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
        apiKeyResult.userId,
      );

      if (userError || !userData.user) {
        log2.error(userError, 'Failed to fetch user for API key', {
          functionName: 'validateJWTToken',
        });
        return { user: null, isServiceRole: false };
      }

      return {
        user: userData.user,
        isServiceRole: false,
        apiKeyTeamId: apiKeyResult.teamId,
      };
    }
    return { user: null, isServiceRole: false };
  }

  // Standard JWT validation
  try {
    jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
  } catch (error) {
    log2.error(error, 'JWT validation error:', {
      functionName: 'validateJWTToken',
    });
    return { user: null, isServiceRole: false };
  }

  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return { user: null, isServiceRole: false };
  }

  return { user, isServiceRole: false };
}

/**
 * Check if user has viewing access to a prototype
 */
export async function checkUserHasPrototypeViewingAccess(
  prototypeId: string,
  jwtToken: string | undefined,
  log2: SystemLogger,
): Promise<{
  user: User | null;
  prototype: Database['public']['Tables']['prototypes']['Row'];
  isServiceRole: boolean;
} | null> {
  try {
    // Create Supabase client with or without JWT
    const supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      jwtToken
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${jwtToken}`,
              },
            },
          }
        : undefined,
    );
    const { data: prototype, error } = await supabaseClient
      .from('prototypes')
      .select('*')
      .eq('id', prototypeId)
      .single();
    if (error || !prototype) {
      log2.consoleLogDevOnly('error', 'Error fetching prototype:', {
        functionName: 'checkUserHasPrototypeViewingAccess',
        error: error.message,
        prototype: prototype,
      });
      return null;
    }
    const { user, isServiceRole } = await validateJWTToken(jwtToken, log2);
    return { user, prototype, isServiceRole };
  } catch (error) {
    log2.error(error, 'Error checking prototype viewing access:', {
      functionName: 'checkUserHasPrototypeViewingAccess',
    });
    return null;
  }
}

/**
 * Check if user has edit access to a prototype (must be owner)
 */
export async function checkUserHasPrototypeEditAccess(
  prototypeId: string,
  jwtToken: string | undefined,
  log2: SystemLogger,
): Promise<{
  user: User | null;
  prototype: Database['public']['Tables']['prototypes']['Row'];
  canEdit: boolean;
  isServiceRole: boolean;
} | null> {
  try {
    // Check if this is a service role token
    const isServiceRoleToken =
      jwtToken === process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Run viewing access check and RPC concurrently
    const [viewingAccessResult, rpcCanEdit] = await Promise.all([
      checkUserHasPrototypeViewingAccess(prototypeId, jwtToken, log2),
      // Only call RPC if not using service role key
      !isServiceRoleToken && jwtToken
        ? (async (): Promise<boolean> => {
            const supabaseClient = createClient<Database>(
              process.env.SUPABASE_URL!,
              process.env.SUPABASE_ANON_KEY!,
              {
                global: {
                  headers: {
                    Authorization: `Bearer ${jwtToken}`,
                  },
                },
              },
            );
            const { data, error } = await supabaseClient.rpc(
              'can_edit_prototype',
              {
                p_prototype_id: prototypeId,
              },
            );
            if (error) {
              log2.error(error, 'Error calling can_edit_prototype RPC:', {
                functionName: 'checkUserHasPrototypeEditAccess',
              });
              return false;
            }
            return data === true;
          })()
        : Promise.resolve(false),
    ]);

    if (!viewingAccessResult) {
      return null;
    }

    const { user, prototype, isServiceRole } = viewingAccessResult;

    // Determine canEdit: service role always has access, otherwise use RPC result
    const canEdit = isServiceRole || rpcCanEdit;

    return {
      user,
      prototype,
      canEdit,
      isServiceRole,
    };
  } catch (error) {
    log2.error(error, 'Error checking prototype edit access:', {
      functionName: 'checkUserHasPrototypeEditAccess',
    });
    return null;
  }
}
