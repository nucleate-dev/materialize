import { createClient } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@supabase/supabase-js';
import type { Database } from '../../../types/supabase.js';
import type {
  APIResponse,
  LLMImageGenerationRequestBody,
  LLMImageGenerationSuccessResponse,
  LLMImageGenerationErrorResponse,
} from '../../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../../types/PublicAPITypes.js';
import { getProvider } from '../providers/provider-registry.js';
import { calculateImageGenerationCredits } from '../utils/cost-calculation.js';
import {
  trackLLMUsage,
  checkCreditsAvailable,
} from '../utils/usage-tracking.js';
import { mapProviderErrorToAPIError } from '../utils/error-mapping.js';

export async function handleImageGenerationImpl(
  request: FastifyRequest<{ Body: LLMImageGenerationRequestBody }>,
  reply: FastifyReply,
  user: User,
  token: string,
): Promise<
  APIResponse<
    LLMImageGenerationSuccessResponse,
    LLMImageGenerationErrorResponse
  >
> {
  const {
    provider: providerName,
    model,
    prompt,
    team_id,
    size,
    quality,
    n,
  } = request.body;
  const logger = request.log2.child({
    function: 'handleImageGenerationImpl',
    userId: user.id,
    provider: providerName,
    model,
  });

  // 1. Validate provider (only OpenAI supports image generation)
  if (providerName !== 'openai') {
    return reply.status(HTTP_STATUS.BAD_REQUEST).send({
      data: null,
      error: {
        error: 'INVALID_PROVIDER',
        message: 'Image generation is only supported with OpenAI (DALL-E)',
      },
    });
  }

  // 2. Validate model
  const validModels = ['dall-e-3', 'dall-e-2'];
  if (!validModels.includes(model)) {
    return reply.status(HTTP_STATUS.BAD_REQUEST).send({
      data: null,
      error: {
        error: 'INVALID_MODEL',
        message: `Invalid model: ${model}. Supported models: dall-e-3, dall-e-2`,
      },
    });
  }

  // 3. Create Supabase client with user token
  const supabase = createClient<Database>(
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

  // 4. Verify team membership using RPC
  const { data: isMember, error: memberError } = await supabase.rpc(
    'is_team_member',
    { p_team_id: team_id },
  );

  if (memberError || !isMember) {
    logger.warn('User is not a member of the team', {
      teamId: team_id,
      memberError,
    });
    return reply.status(HTTP_STATUS.FORBIDDEN).send({
      data: null,
      error: {
        error: 'UNAUTHORIZED',
        message: 'You are not a member of this team',
      },
    });
  }

  // 5. Calculate estimated credits for pre-check
  const imageCount = n ?? 1;
  const imageSize = size ?? '1024x1024';
  const imageQuality = quality ?? 'standard';
  const estimatedCredits = calculateImageGenerationCredits(
    model,
    imageSize,
    imageQuality,
    imageCount,
  );

  // 6. Check credits available
  const creditCheck = await checkCreditsAvailable(
    supabase,
    user.id,
    team_id,
    logger,
  );
  if (!creditCheck.hasCredits || creditCheck.remaining < estimatedCredits) {
    return reply.status(HTTP_STATUS.PAYMENT_REQUIRED).send({
      data: null,
      error: {
        error: 'INSUFFICIENT_CREDITS',
        message:
          'Insufficient credits. Please upgrade your plan or purchase more credits.',
      },
    });
  }

  // 7. Get provider and execute image generation
  try {
    const provider = getProvider(providerName, logger);

    if (!provider.supportsImageGeneration || !provider.generateImage) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'INVALID_PROVIDER',
          message: 'This provider does not support image generation',
        },
      });
    }

    const result = await provider.generateImage({
      model,
      prompt,
      size: imageSize,
      quality: imageQuality,
      n: imageCount,
    });

    // 8. Calculate and track credits
    const creditsUsed = calculateImageGenerationCredits(
      model,
      imageSize,
      imageQuality,
      result.images.length,
    );

    const usageResult = await trackLLMUsage(
      supabase,
      user.id,
      team_id,
      creditsUsed,
      logger,
      {
        provider: providerName,
        model,
        requestType: 'image_generation',
      },
    );

    logger.info('Image generation successful', {
      imagesGenerated: result.images.length,
      creditsUsed,
    });

    return reply.status(HTTP_STATUS.OK).send({
      data: {
        images: result.images.map((img) => ({
          base64: img.base64,
          url: img.url,
          revised_prompt: img.revisedPrompt,
        })),
        credits_used: creditsUsed,
        credits_remaining: usageResult.totalRemainingCredits,
        model,
        provider: providerName,
      },
      error: null,
    });
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Image generation failed',
    );

    const mappedError = mapProviderErrorToAPIError(error);
    return reply.status(mappedError.status).send({
      data: null,
      error: mappedError.response,
    });
  }
}
