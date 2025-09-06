import { User, createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type { Database } from '../types/supabase.js';

interface JWTPayload {
  sub?: string;
  userId?: string;
  user_id?: string;
}

/**
 * Validate a JWT token using JWT_SECRET and return User
 */
export async function validateJWTToken(token: string): Promise<User | null> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      return null;
    }

    jwt.verify(token, jwtSecret) as JWTPayload;
  } catch (error) {
    console.error('JWT validation error:', error);
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
  jwtToken?: string,
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

    let user: User | null = null;
    if (jwtToken) {
      user = await validateJWTToken(jwtToken);
    }

    return { user, prototype };
  } catch (error) {
    console.error('Error checking prototype viewing access:', error);
    return null;
  }
}

/**
 * Check if user has edit access to a prototype (must be owner)
 */
export async function checkUserHasPrototypeEditAccess(
  prototypeId: string,
  jwtToken?: string,
): Promise<{
  user: User;
  prototype: Database['public']['Tables']['prototypes']['Row'];
  canEdit: boolean;
} | null> {
  try {
    if (!jwtToken) {
      return null;
    }

    // Get prototype to check ownership && validate JWT
    const { user, prototype } = (await checkUserHasPrototypeViewingAccess(
      prototypeId,
      jwtToken,
    )) || { user: null, prototype: null };
    if (prototype === null || user === null) {
      return null;
    }

    // Check if user is the owner
    if (prototype.owner_id === user.id) {
      return { user, prototype, canEdit: true };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error checking prototype edit access:', error);
    return null;
  }
}
