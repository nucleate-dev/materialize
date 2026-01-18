import { createClient, User } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type { Database } from '../types/supabase.js';

interface JWTPayload {
  sub?: string;
  userId?: string;
  user_id?: string;
}

/**
 * Validate a JWT token using JWT_SECRET and return User
 */
export async function validateJWTToken(
  token: string | undefined,
  log2: SystemLogger,
): Promise<{ user: User | null; isServiceRole: boolean }> {
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { user: null, isServiceRole: true };
  }

  try {
    if (!token) {
      return { user: null, isServiceRole: false };
    }

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
