import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GlideClient } from '@valkey/valkey-glide';
import {
  APIResponse,
  EndChatRequestBody,
  EndChatResponse,
  HTTP_STATUS,
  StandardErrorResponse,
  StartChatRequestBody,
  StartChatResponse,
} from '../../types/PublicAPITypes.js';
import { CACHE_KEYS } from '../../types/InternalTypes.js';
import { hgetallAsActiveBuild } from '../../utils/cacheInteractionUtils.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { isDevServerInShutdownStages } from '../../utils/prototypeDevServerStatusUtils.js';

export class OrchestrationService {
  private fastifyApp: FastifyInstance;
  private cache: GlideClient;
  private logger: SystemLogger;

  constructor(
    fastifyApp: FastifyInstance,
    cache: GlideClient,
    logger: SystemLogger,
  ) {
    this.fastifyApp = fastifyApp;
    this.cache = cache;
    this.logger = logger.child({ service: 'OrchestrationService' });
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /orchestration/start-chat
    app.post<{
      Body: StartChatRequestBody;
    }>(
      '/orchestration/start-chat',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleStartChat.bind(this),
    );

    // POST /orchestration/end-chat
    app.post<{
      Body: EndChatRequestBody;
    }>(
      '/orchestration/end-chat',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleEndChat.bind(this),
    );
  }

  /**
   * Validates the orchestration token from the request headers
   * @param request - The Fastify request object
   * @param prototypeId - The prototype ID to validate against
   * @returns The build ID if validation succeeds, null if it fails
   */
  private async validateOrchestrationToken(
    request: FastifyRequest,
    prototypeId: string,
  ): Promise<{ isValid: boolean; buildId?: string; errorMessage?: string }> {
    // Extract token from x-orchestration-token header
    const providedToken = request.headers['x-orchestration-token'];

    if (!providedToken || typeof providedToken !== 'string') {
      this.logger.warn('Missing orchestration token in request', {
        prototypeId,
      });
      return {
        isValid: false,
        errorMessage: 'Missing x-orchestration-token header',
      };
    }

    // Get current build ID for this prototype from cache
    const currentBuildIdRaw = await this.cache.get(
      CACHE_KEYS.protoCurrentBuild(prototypeId),
    );

    if (!currentBuildIdRaw) {
      this.logger.warn('No active build found for prototype', { prototypeId });
      return {
        isValid: false,
        errorMessage: 'No active build found for this prototype',
      };
    }

    // Convert GlideString to string
    const currentBuildId =
      typeof currentBuildIdRaw === 'string'
        ? currentBuildIdRaw
        : currentBuildIdRaw.toString();

    // Fetch the active build from cache
    const activeBuild = await hgetallAsActiveBuild(
      this.cache,
      CACHE_KEYS.activeBuild(currentBuildId),
    );

    if (!activeBuild) {
      this.logger.error(
        new Error('Active build data not found in cache'),
        'Build metadata missing',
        { prototypeId, buildId: currentBuildId },
      );
      return {
        isValid: false,
        errorMessage: 'Build metadata not found',
      };
    }

    // Validate the token
    if (activeBuild.orchestration_token !== providedToken) {
      this.logger.warn('Invalid orchestration token provided', {
        prototypeId,
        buildId: currentBuildId,
      });
      return {
        isValid: false,
        errorMessage: 'Invalid orchestration token',
      };
    }

    // Token is valid
    this.logger.consoleLogDevOnly(
      'info',
      'Orchestration token validated successfully',
      {
        prototypeId,
        buildId: currentBuildId,
      },
    );

    return {
      isValid: true,
      buildId: currentBuildId,
    };
  }

  private async handleStartChat(
    request: FastifyRequest<{ Body: StartChatRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<StartChatResponse, StandardErrorResponse>
  > {
    const { prototype_id } = request.body;

    // Validate orchestration token
    const validation = await this.validateOrchestrationToken(
      request,
      prototype_id,
    );

    if (!validation.isValid) {
      const statusCode =
        validation.errorMessage === 'No active build found for this prototype'
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.UNAUTHORIZED;

      const errorResponse: StandardErrorResponse = {
        error:
          statusCode === HTTP_STATUS.NOT_FOUND ? 'NOT_FOUND' : 'UNAUTHORIZED',
        message: validation.errorMessage!,
      };
      return reply.status(statusCode).send({
        data: null,
        error: errorResponse,
      });
    }

    // Check if build is in shutdown stages (cleaning or building)
    const activeBuildKey = CACHE_KEYS.activeBuild(validation.buildId!);
    const activeBuild = await hgetallAsActiveBuild(this.cache, activeBuildKey);

    if (!activeBuild) {
      this.logger.error(
        new Error('Active build data not found in cache'),
        'Build metadata missing during start chat',
        { prototypeId: prototype_id, buildId: validation.buildId },
      );
      const errorResponse: StandardErrorResponse = {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Build metadata not found',
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }

    if (isDevServerInShutdownStages(activeBuild.status)) {
      this.logger.warn('Cannot start chat - build is in shutdown stage', {
        prototypeId: prototype_id,
        buildId: validation.buildId,
        currentStatus: activeBuild.status,
      });
      const errorResponse: StandardErrorResponse = {
        error: 'CONFLICT',
        message: `Cannot start chat while sandbox is in cleanup stages ${activeBuild.status}. Please get a new dev-server.`,
      };
      return reply.status(HTTP_STATUS.CONFLICT).send({
        data: null,
        error: errorResponse,
      });
    }

    // Update active build state in cache
    const currentTime = Math.floor(Date.now() / 1000);

    try {
      await this.cache.hset(activeBuildKey, {
        status: 'chatting',
        last_touched: currentTime.toString(),
      });

      this.logger.consoleLogDevOnly('info', 'Updated build state to chatting', {
        prototypeId: prototype_id,
        buildId: validation.buildId,
        timestamp: currentTime,
      });

      const successResponse: StartChatResponse = {
        success: true,
        message: 'Chat session started, build state updated to chatting',
      };
      return reply.status(HTTP_STATUS.OK).send({
        data: successResponse,
        error: null,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to update build state to chatting',
        { prototypeId: prototype_id, buildId: validation.buildId },
      );

      const errorResponse: StandardErrorResponse = {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update build state',
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }
  }

  private async handleEndChat(
    request: FastifyRequest<{ Body: EndChatRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<EndChatResponse, StandardErrorResponse>> {
    const { prototype_id } = request.body;

    // Validate orchestration token
    const validation = await this.validateOrchestrationToken(
      request,
      prototype_id,
    );

    if (!validation.isValid) {
      const statusCode =
        validation.errorMessage === 'No active build found for this prototype'
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.UNAUTHORIZED;

      const errorResponse: StandardErrorResponse = {
        error:
          statusCode === HTTP_STATUS.NOT_FOUND ? 'NOT_FOUND' : 'UNAUTHORIZED',
        message: validation.errorMessage!,
      };
      return reply.status(statusCode).send({
        data: null,
        error: errorResponse,
      });
    }

    // Update active build state in cache
    const activeBuildKey = CACHE_KEYS.activeBuild(validation.buildId!);
    const currentTime = Math.floor(Date.now() / 1000);

    try {
      await this.cache.hset(activeBuildKey, {
        status: 'stable',
        last_touched: currentTime.toString(),
      });

      this.logger.consoleLogDevOnly('info', 'Updated build state to stable', {
        prototypeId: prototype_id,
        buildId: validation.buildId,
        timestamp: currentTime,
      });

      const successResponse: EndChatResponse = {
        success: true,
        message: 'Chat session ended, build state updated to stable',
      };
      return reply.status(HTTP_STATUS.OK).send({
        data: successResponse,
        error: null,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to update build state to stable',
        { prototypeId: prototype_id, buildId: validation.buildId },
      );

      const errorResponse: StandardErrorResponse = {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update build state',
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }
  }
}
