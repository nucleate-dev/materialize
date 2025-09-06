import { SupabaseClient, User, createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type {
  PrototypeAuthResult,
  PrototypeLimitCheck,
  SubscriptionPlanType,
} from '../types/InternalTypes.js';
import type { Database } from '../types/supabase.js';

/**
 * Authenticate user and get subscription information
 */
export async function authenticatePrototypeUser(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<PrototypeAuthResult> {
  try {
    // Verify JWT token with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        success: false,
        userId: '',
        subscriptionPlan: 'free',
        error: 'AUTH_ERROR',
        message: 'Invalid or expired authentication token',
      };
    }

    // Get user's subscription plan
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('plan_id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (subscriptionError) {
      console.error('Error fetching subscription:', subscriptionError);
      // Default to free plan if there's an error
      return {
        success: true,
        userId: user.id,
        subscriptionPlan: 'free',
      };
    }

    const subscriptionPlan: SubscriptionPlanType =
      (subscription?.plan_id as SubscriptionPlanType) || 'free';

    return {
      success: true,
      userId: user.id,
      subscriptionPlan,
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      userId: '',
      subscriptionPlan: 'free',
      error: 'AUTH_ERROR',
      message: 'Authentication failed',
    };
  }
}

/**
 * Check if user can create more prototypes based on their subscription plan
 */
export async function checkPrototypeLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  subscriptionPlan: SubscriptionPlanType,
): Promise<PrototypeLimitCheck> {
  try {
    // Free users are limited to 5 prototypes
    const maxAllowed = subscriptionPlan === 'free' ? 5 : Infinity;

    if (maxAllowed === Infinity) {
      return {
        canCreate: true,
        currentCount: 0,
        maxAllowed,
      };
    }

    // Count existing prototypes for free users
    const { count, error: countError } = await supabase
      .from('prototypes')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);

    if (countError) {
      return {
        canCreate: false,
        currentCount: 0,
        maxAllowed,
        error: 'DATABASE_ERROR',
        message: 'Failed to check prototype count',
      };
    }

    const currentCount = count || 0;
    const canCreate = currentCount < maxAllowed;

    return {
      canCreate,
      currentCount,
      maxAllowed,
      error: canCreate ? undefined : 'PROTOTYPE_LIMIT_REACHED',
      message: canCreate
        ? undefined
        : `Free plan allows maximum ${maxAllowed} prototypes. Upgrade to Pro for unlimited prototypes.`,
    };
  } catch (error) {
    console.error('Error checking prototype limit:', error);
    return {
      canCreate: false,
      currentCount: 0,
      maxAllowed: 5,
      error: 'DATABASE_ERROR',
      message: 'Failed to check prototype limits',
    };
  }
}

interface JWTPayload {
  sub?: string;
  userId?: string;
  user_id?: string;
}

/**
 * Validate a JWT token using JWT_SECRET and return userId if valid
 */
export async function validateJWTToken(token: string): Promise<User | null> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      return null;
    }

    jwt.verify(token, jwtSecret) as JWTPayload;

    // Extract user ID from the decoded token
    // Assuming the token contains a 'sub' or 'userId' field
    // decoded.sub || decoded.userId || decoded.user_id || null;
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
