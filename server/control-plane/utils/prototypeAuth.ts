import { User, createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

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
): Promise<User | null> {
  try {
    if (!token) {
      return null;
    }

    jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
  } catch (error) {
    log2.error(error, 'JWT validation error:', {
      functionName: 'validateJWTToken',
    });
    return null;
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
    return null;
  }

  return user;
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
      return null;
    }
    const user = await validateJWTToken(jwtToken, log2);
    return { user, prototype };
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
  user: User;
  prototype: Database['public']['Tables']['prototypes']['Row'];
  canEdit: boolean;
} | null> {
  try {
    // Get prototype to check ownership && validate JWT
    const { user, prototype } = (await checkUserHasPrototypeViewingAccess(
      prototypeId,
      jwtToken,
      log2,
    )) || { user: null, prototype: null };
    if (prototype === null || user === null) {
      return null;
    }

    // Check if user is the owner
    return {
      user,
      prototype,
      canEdit: prototype.owner_id === user.id,
    };
  } catch (error) {
    log2.error(error, 'Error checking prototype edit access:', {
      functionName: 'checkUserHasPrototypeEditAccess',
    });
    return null;
  }
}
