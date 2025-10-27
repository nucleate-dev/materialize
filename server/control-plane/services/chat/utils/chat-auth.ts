import { FastifyRequest } from 'fastify';
import type { User } from '@supabase/supabase-js';
import type { ChatRequestBody } from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { hasExceededChatUsageLimit } from '../../../utils/subscriptionChecks.js';

export interface ChatAuthResult {
  user: User;
  userTier: string;
  paywallResult: {
    exceeded: boolean;
    current: number;
    limit: number;
    plan: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    stripeCustomerId: string;
  };
}

export interface ChatAuthError {
  type: 'UNAUTHORIZED' | 'PAYWALL_EXCEEDED';
  error: string;
  usage?: {
    current: number;
    limit: number;
    tier: string;
  };
}

/**
 * Validates user authorization and subscription limits for chat requests
 * Combines steps 2 and 3 from ChatService into a single function
 */
export async function validateChatAuth(
  request: FastifyRequest<{ Body: ChatRequestBody }>,
  prototype_id: string,
): Promise<
  | { success: true; result: ChatAuthResult }
  | { success: false; error: ChatAuthError }
> {
  const token = request.headers.authorization?.split(' ')[1] ?? '';

  // ------------------------------------------------------------------------------------------------
  // Step 2: Must be an AUTHORIZED user with prototype edit access
  // ------------------------------------------------------------------------------------------------
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    token,
    request.log2,
  );

  if (authResult === null || authResult.user === null) {
    return {
      success: false,
      error: {
        type: 'UNAUTHORIZED',
        error: 'Unauthorized: Invalid token',
      },
    };
  }

  if (authResult.canEdit === false) {
    return {
      success: false,
      error: {
        type: 'UNAUTHORIZED',
        error:
          'Unauthorized: User does not have permissions to edit this prototype',
      },
    };
  }

  const user = authResult.user;

  // ------------------------------------------------------------------------------------------------
  // Step 3: Fetch user subscription and paywall the user if needed
  // ------------------------------------------------------------------------------------------------
  const paywallResult = await hasExceededChatUsageLimit(
    token,
    user.id,
    request.log2,
  );

  if (paywallResult.exceeded) {
    return {
      success: false,
      error: {
        type: 'PAYWALL_EXCEEDED',
        error: 'Unauthorized: User has exceeded their monthly usage limit',
        usage: {
          current: paywallResult.current,
          limit: 15,
          tier: 'free',
        },
      },
    };
  }

  return {
    success: true,
    result: {
      user,
      userTier: paywallResult.plan,
      paywallResult,
    },
  };
}
