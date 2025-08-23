import { SupabaseClient, createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import type { Database } from '../types/supabase.js';
import type {
  PrototypeAuthResult,
  PrototypeLimitCheck,
  PrototypeFilesResult,
  SubscriptionPlanType,
  PrototypeFile,
} from '../types/InternalTypes.js';

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

    const subscriptionPlan: SubscriptionPlanType = (subscription?.plan_id as SubscriptionPlanType) || 'free';

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

/**
 * Get prototype files for forking
 */
export async function getPrototypeFiles(
  supabase: SupabaseClient<Database>,
  prototypeId: string,
): Promise<PrototypeFilesResult> {
  try {
    const { data: files, error } = await supabase
      .from('prototype_files')
      .select('*')
      .eq('prototype_id', prototypeId);

    if (error) {
      return {
        success: false,
        error: 'DATABASE_ERROR',
        message: error.message,
      };
    }

    if (!files || files.length === 0) {
      return {
        success: false,
        error: 'NO_FILES_FOUND',
        message: 'No files found for the specified prototype',
      };
    }

    // Convert to our internal type
    const prototypeFiles: PrototypeFile[] = files.map(file => ({
      prototype_id: file.prototype_id || prototypeId,
      name: file.name,
      contents: file.contents || '',
      file_type: file.file_type as 'text' | 'asset',
      storage_path: file.storage_path,
    }));

    return {
      success: true,
      files: prototypeFiles,
    };
  } catch (error) {
    console.error('Error fetching prototype files:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to fetch prototype files',
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
export function validateJWTToken(token: string): string | null {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      return null;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Extract user ID from the decoded token
    // Assuming the token contains a 'sub' or 'userId' field
    return decoded.sub || decoded.userId || decoded.user_id || null;
  } catch (error) {
    console.error('JWT validation error:', error);
    return null;
  }
}

/**
 * Check if user has viewing access to a prototype
 */
export async function checkUserHasPrototypeViewingAccess(
  prototypeId: string,
  jwtToken?: string,
): Promise<Database['public']['Tables']['prototypes']['Row'] | null> {
  try {
    // Create Supabase client with or without JWT
    const supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      jwtToken ? {
        global: {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      } : undefined,
    );

    const { data: prototype, error } = await supabaseClient
      .from('prototypes')
      .select('*')
      .eq('id', prototypeId)
      .single();

    if (error || !prototype) {
      return null;
    }

    return prototype;
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
): Promise<boolean> {
  try {
    if (!jwtToken) {
      return false;
    }

    // Validate JWT and get user ID
    const userId = validateJWTToken(jwtToken);
    if (!userId) {
      return false;
    }

    // Get prototype to check ownership
    const prototype = await checkUserHasPrototypeViewingAccess(prototypeId, jwtToken);
    if (!prototype) {
      return false;
    }

    // Check if user is the owner
    return prototype.owner_id === userId;
  } catch (error) {
    console.error('Error checking prototype edit access:', error);
    return false;
  }
}