import { S3Client } from '@aws-sdk/client-s3';
import { GlideClient } from '@valkey/valkey-glide';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  DeletePrototypeErrorResponse,
  DeletePrototypeSuccessResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import { CleanupService } from '../cleanup/CleanupService.js';
import { DispatcherService } from '../dispatcher/DispatcherService.js';
import { handleCreatePrototypeImpl } from './handlers/handleCreatePrototype.js';
import handleDeletePrototypeImpl from './handlers/handleDeletePrototype.js';
import handleFetchViewingUrlImpl from './handlers/handleFetchViewingUrl.js';
import { PostHogEvents } from '../../loggers/PostHogEvents.js';
import { validateJWTToken } from '../../utils/prototypeAuth.js';

export class PrototypeManagementService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private s3Client: S3Client;
  private cache: GlideClient;
  private dispatcherService: DispatcherService;
  private cleanupService: CleanupService;

  constructor(
    s3Client: S3Client,
    cache: GlideClient,
    dispatcherService: DispatcherService,
    cleanupService: CleanupService,
  ) {
    this.s3Client = s3Client;
    this.cache = cache;
    this.dispatcherService = dispatcherService;
    this.cleanupService = cleanupService;

    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        'Missing required Supabase environment variables for PrototypeManagementService',
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    app.post<{ Body: FetchViewingUrlRequestBody }>(
      '/prototype/fetch-viewing-url',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
              current_page: {
                type: 'string',
                enum: ['view', 'edit'],
              },
            },
          },
        },
      },
      this.handleFetchViewingUrl.bind(this),
    );

    app.post<{ Body: CreatePrototypeRequestBody }>(
      '/prototype/create',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              folder_id: { type: 'string' },
              prototype_id: { type: 'string' }, // For forking
              visibility: {
                type: 'string',
                enum: ['PUBLIC', 'SELF'],
              },
              design_style: {
                type: 'string',
                enum: ['tamagui', 'stylesheets', 'nativewind'],
              },
              custom_design_system: {
                type: ['string', 'null'],
              },
              framework: {
                type: 'string',
                enum: ['mobile_expo_react_native', 'web_nextjs_react'],
              },
            },
          },
        },
      },
      this.handleCreatePrototype.bind(this),
    );

    app.delete<{ Params: { prototype_id: string } }>(
      '/prototype/:prototype_id',
      {
        schema: {
          params: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleDeletePrototype.bind(this),
    );
  }

  private async handleFetchViewingUrl(
    request: FastifyRequest<{ Body: FetchViewingUrlRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<FetchViewingUrlSuccessResponse, StandardErrorResponse>
  > {
    return await handleFetchViewingUrlImpl(
      request,
      reply,
      this.dispatcherService,
    );
  }

  private async handleCreatePrototype(
    request: FastifyRequest<{ Body: CreatePrototypeRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<CreatePrototypeSuccessResponse, CreatePrototypeErrorResponse>
  > {
    // Extract JWT token from Authorization header and validate it
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn('Unauthorized user');
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      });
    }

    // Update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    // Setup PostHog logger with context
    const posthogLogger = request.posthogLogger.child({
      function: 'handleCreatePrototype',
      service: 'PrototypeManagementService',
      is_forking: !!request.body.prototype_id,
      has_custom_design_system: !!request.body.custom_design_system,
    });

    return await posthogLogger.timeAndRecord(
      user.id,
      PostHogEvents.prototype_creation,
      async () => {
        return await handleCreatePrototypeImpl(request, reply, this.s3Client);
      },
    );
  }

  private async handleDeletePrototype(
    request: FastifyRequest<{ Params: { prototype_id: string } }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DeletePrototypeSuccessResponse, DeletePrototypeErrorResponse>
  > {
    // Extract JWT token from Authorization header and validate it
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn('Unauthorized user');
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      });
    }

    // Update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    // Setup PostHog logger with context
    const posthogLogger = request.posthogLogger.child({
      function: 'handleDeletePrototype',
      service: 'PrototypeManagementService',
      prototype_id: request.params.prototype_id,
    });

    return await posthogLogger.timeAndRecord(
      user.id,
      PostHogEvents.prototype_deletion,
      async () => {
        return await handleDeletePrototypeImpl(
          request,
          reply,
          this.s3Client,
          this.cache,
          this.cleanupService,
        );
      },
    );
  }
}
