/**
 * AI Document Service
 *
 * Handles document generation using Gemini for PRDs and design critiques.
 * Separate from the main chat service for ad-hoc AI document generation.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { baseLogger } from "../../loggers/index.js";
import {
  AIDocumentRequest,
  AIDocumentResponse,
  AIDocument,
  AIDocumentType,
} from "../../types/AIDocumentTypes.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { trackApiUsageBuildWorker } from "../chat/cost/usage-tracking.js";
import { VERCEL_MODEL_COSTS_USD } from "../chat/cost/cost-calculation.js";
import {
  PRD_SYSTEM_PROMPT,
  CRITIQUE_SYSTEM_PROMPT,
  generatePRDPrompt,
  generateCritiquePrompt,
} from "./prompts.js";
import { getWorkerContext } from "../../worker.js";

/**
 * Model to use for document generation - powerful multimodal model
 */
const DOCUMENT_MODEL = "gemini-2.5-flash";

/**
 * Credit cost per document generation
 * This is a fixed cost since document generation is a premium feature
 */
const CREDITS_PER_DOCUMENT = 2;

/**
 * Configuration for document titles based on type
 */
const DOCUMENT_TITLES: Record<AIDocumentType, string> = {
  "generate-prd": "Product Requirements Document",
  "critique-designs": "Design Critique Report",
};

interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Estimates the cost in USD based on usage information from AI SDK.
 */
function estimateCostUsd(usage: UsageInfo | undefined): number | undefined {
  if (!usage) return undefined;

  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;

  const pricing = VERCEL_MODEL_COSTS_USD[DOCUMENT_MODEL];
  if (!pricing) return undefined;

  const inputCost = pricing.inputUsdPer1M
    ? (promptTokens * pricing.inputUsdPer1M) / 1_000_000
    : 0;
  const outputCost = pricing.outputUsdPer1M
    ? (completionTokens * pricing.outputUsdPer1M) / 1_000_000
    : 0;

  const total = inputCost + outputCost;
  return total > 0 ? total : undefined;
}

/**
 * AI Document Service for generating PRDs and design critiques
 */
export class AIDocumentService {
  private readonly supabaseClientService: SupabaseClientService;
  private readonly logger: SystemLogger;

  constructor(supabaseClientService: SupabaseClientService) {
    this.supabaseClientService = supabaseClientService;
    this.logger = baseLogger.child({
      service: "AIDocumentService",
    });
  }

  /**
   * Register Fastify routes for AI document generation
   */
  public registerRoutes(app: FastifyInstance): void {
    app.post<{
      Body: AIDocumentRequest;
    }>("/api/ai/document", {
      handler: this.handleDocumentGeneration.bind(this),
    });
  }

  /**
   * Handle POST /api/ai/document request
   */
  private async handleDocumentGeneration(
    request: FastifyRequest<{ Body: AIDocumentRequest }>,
    reply: FastifyReply,
  ): Promise<void> {
    const log = request.log2 ?? this.logger;
    const startTime = Date.now();

    try {
      const body = request.body;

      // Validate request
      const validationError = this.validateRequest(body);
      if (validationError) {
        reply.code(400).send({
          success: false,
          error: validationError,
        } satisfies AIDocumentResponse);
        return;
      }

      // Get worker context for user/team info
      const context = getWorkerContext();
      const userId = context.userId;
      const teamId = context.teamId;

      if (!userId || !teamId) {
        log.error(
          new Error("Missing user context"),
          "User context not available",
          {
            hasUserId: !!userId,
            hasTeamId: !!teamId,
          },
        );
        reply.code(401).send({
          success: false,
          error: "Unauthorized: User context not available",
        } satisfies AIDocumentResponse);
        return;
      }

      // Get Supabase client
      const supabase = this.supabaseClientService.getClient();

      // Track credit usage before generation
      const usageResult = await trackApiUsageBuildWorker(
        supabase,
        userId,
        body.prototypeId,
        log,
        CREDITS_PER_DOCUMENT,
        teamId,
      );

      log.info("Credit usage tracked for document generation", {
        type: body.type,
        prototypeId: body.prototypeId,
        creditsCharged: CREDITS_PER_DOCUMENT,
        remainingCredits: usageResult.totalRemainingCredits,
      });

      // Generate the document
      const document = await this.generateDocument(body, log);

      const duration = Date.now() - startTime;
      log.info("Document generation completed", {
        type: body.type,
        prototypeId: body.prototypeId,
        duration,
        costUsd: document.costUsd,
      });

      reply.send({
        success: true,
        document,
        creditsCharged: CREDITS_PER_DOCUMENT,
      } satisfies AIDocumentResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      log.error(
        error instanceof Error ? error : new Error(String(error)),
        "Document generation failed",
        {
          prototypeId: request.body?.prototypeId,
          type: request.body?.type,
        },
      );

      reply.code(500).send({
        success: false,
        error: `Document generation failed: ${errorMessage}`,
      } satisfies AIDocumentResponse);
    }
  }

  /**
   * Validate the document generation request
   */
  private validateRequest(body: AIDocumentRequest): string | null {
    if (!body.type || !["generate-prd", "critique-designs"].includes(body.type)) {
      return "Invalid document type. Must be 'generate-prd' or 'critique-designs'";
    }

    if (!body.prototypeId) {
      return "prototypeId is required";
    }

    if (!body.screens || body.screens.length === 0) {
      return "At least one screen is required";
    }

    // Validate each screen
    for (let i = 0; i < body.screens.length; i++) {
      const screen = body.screens[i];
      if (!screen.path) {
        return `Screen ${i + 1} is missing path`;
      }
      if (!screen.screenshotDataUrl) {
        return `Screen ${i + 1} is missing screenshot`;
      }
      if (!screen.screenshotDataUrl.startsWith("data:image/")) {
        return `Screen ${i + 1} has invalid screenshot format`;
      }
    }

    // Limit number of screens to prevent abuse
    if (body.screens.length > 10) {
      return "Maximum 10 screens allowed per document";
    }

    return null;
  }

  /**
   * Generate document using Gemini
   */
  private async generateDocument(
    request: AIDocumentRequest,
    log: SystemLogger,
  ): Promise<AIDocument> {
    const { type, screens, prototypeName, framework, designSystem } = request;

    // Select appropriate prompt based on type
    const systemPrompt =
      type === "generate-prd" ? PRD_SYSTEM_PROMPT : CRITIQUE_SYSTEM_PROMPT;

    const userPrompt =
      type === "generate-prd"
        ? generatePRDPrompt(screens, prototypeName, framework, designSystem)
        : generateCritiquePrompt(screens, prototypeName, framework, designSystem);

    log.info("Starting Gemini document generation", {
      type,
      model: DOCUMENT_MODEL,
      screenCount: screens.length,
      prototypeName,
    });

    // Build content with images
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string; mediaType?: string }
    > = [];

    // Add the text prompt first
    content.push({ type: "text", text: userPrompt });

    // Add each screenshot as an image
    for (const screen of screens) {
      // Extract base64 data and mime type from data URL
      const matches = screen.screenshotDataUrl.match(
        /^data:(image\/[^;]+);base64,(.+)$/,
      );
      if (matches) {
        const [, mediaType, base64Data] = matches;
        content.push({
          type: "image",
          image: base64Data,
          mediaType: mediaType,
        });
      }
    }

    const modelInstance = google(DOCUMENT_MODEL);

    // Generate the document
    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    });

    // Extract usage for cost calculation
    const usageRaw = result.usage as unknown as UsageInfo | undefined;
    const costUsd = estimateCostUsd(usageRaw);

    log.info("Gemini generation completed", {
      type,
      model: DOCUMENT_MODEL,
      promptTokens: usageRaw?.promptTokens,
      completionTokens: usageRaw?.completionTokens,
      costUsd,
    });

    return {
      title: DOCUMENT_TITLES[type],
      content: result.text,
      generatedAt: new Date().toISOString(),
      model: DOCUMENT_MODEL,
      usage: usageRaw
        ? {
            inputTokens: usageRaw.promptTokens ?? 0,
            outputTokens: usageRaw.completionTokens ?? 0,
          }
        : undefined,
      costUsd,
    };
  }
}
