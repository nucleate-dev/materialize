import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase.js";
import type {
  APIResponse,
  LLMCompletionRequestBody,
  LLMCompletionSuccessResponse,
  LLMCompletionErrorResponse,
  LLMTextBlock,
  LLMImageBlock,
} from "../../../types/PublicAPITypes.js";
import { HTTP_STATUS } from "../../../types/PublicAPITypes.js";
import { getProvider, isValidProvider } from "../providers/provider-registry.js";
import type { ProviderMessage, ProviderMessagePart } from "../providers/types.js";
import { calculateCompletionCredits } from "../utils/cost-calculation.js";
import { trackLLMUsage, checkCreditsAvailable } from "../utils/usage-tracking.js";
import { mapProviderErrorToAPIError } from "../utils/error-mapping.js";
import { fetchImageAsBase64 } from "../utils/image-processing.js";

export async function handleCompletionImpl(
  request: FastifyRequest<{ Body: LLMCompletionRequestBody }>,
  reply: FastifyReply,
  user: User,
  token: string,
): Promise<APIResponse<LLMCompletionSuccessResponse, LLMCompletionErrorResponse>> {
  const {
    provider: providerName,
    model,
    messages,
    team_id,
    max_tokens,
    temperature,
    system_prompt,
  } = request.body;
  const logger = request.log2.child({
    function: "handleCompletionImpl",
    userId: user.id,
    provider: providerName,
    model,
  });

  // 1. Validate provider
  if (!isValidProvider(providerName)) {
    return reply.status(HTTP_STATUS.BAD_REQUEST).send({
      data: null,
      error: {
        error: "INVALID_PROVIDER",
        message: `Invalid provider: ${providerName}. Supported providers: anthropic, openai, google`,
      },
    });
  }

  // 2. Create Supabase client with user token (RLS handles team membership)
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

  // 3. Verify team membership using RPC
  const { data: isMember, error: memberError } = await supabase.rpc(
    "is_team_member",
    { p_team_id: team_id },
  );

  if (memberError || !isMember) {
    logger.warn("User is not a member of the team", { teamId: team_id, memberError });
    return reply.status(HTTP_STATUS.FORBIDDEN).send({
      data: null,
      error: {
        error: "UNAUTHORIZED",
        message: "You are not a member of this team",
      },
    });
  }

  // 4. Check credits available
  const creditCheck = await checkCreditsAvailable(supabase, user.id, team_id, logger);
  if (!creditCheck.hasCredits) {
    return reply.status(HTTP_STATUS.PAYMENT_REQUIRED).send({
      data: null,
      error: {
        error: "INSUFFICIENT_CREDITS",
        message:
          "Insufficient credits. Please upgrade your plan or purchase more credits.",
      },
    });
  }

  // 5. Get provider and execute completion
  try {
    const provider = getProvider(providerName, logger);

    // Convert messages to provider format
    const providerMessages = await convertMessagesToProviderFormat(messages);

    const result = await provider.complete({
      model,
      messages: providerMessages,
      maxTokens: max_tokens,
      temperature,
      systemPrompt: system_prompt,
    });

    // 6. Calculate and track credits
    const creditsUsed = calculateCompletionCredits(
      model,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );

    const usageResult = await trackLLMUsage(supabase, user.id, team_id, creditsUsed, logger, {
      provider: providerName,
      model,
      requestType: "completion",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    logger.info("LLM completion successful", {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      creditsUsed,
    });

    return reply.status(HTTP_STATUS.OK).send({
      data: {
        content: result.content,
        usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          total_tokens: result.usage.totalTokens,
        },
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
      "LLM completion failed",
    );

    const mappedError = mapProviderErrorToAPIError(error);
    return reply.status(mappedError.status).send({
      data: null,
      error: mappedError.response,
    });
  }
}

async function convertMessagesToProviderFormat(
  messages: LLMCompletionRequestBody["messages"],
): Promise<ProviderMessage[]> {
  const converted: ProviderMessage[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      converted.push({
        role: msg.role,
        content: msg.content,
      });
      continue;
    }

    // Handle array content with text and image blocks
    const parts: ProviderMessagePart[] = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        const textBlock = block as LLMTextBlock;
        parts.push({
          type: "text",
          text: textBlock.text,
        });
      } else if (block.type === "image") {
        const imageBlock = block as LLMImageBlock;
        const source = imageBlock.source;

        if (source.type === "base64" && source.data) {
          parts.push({
            type: "image",
            imageData: {
              base64: source.data,
              mediaType: source.media_type ?? "image/jpeg",
            },
          });
        } else if (source.type === "url" && source.url) {
          // Fetch the image and convert to base64
          const fetchedImage = await fetchImageAsBase64(source.url);
          parts.push({
            type: "image",
            imageData: {
              base64: fetchedImage.base64,
              mediaType: fetchedImage.mediaType,
            },
          });
        }
      }
    }

    converted.push({
      role: msg.role,
      content: parts,
    });
  }

  return converted;
}
