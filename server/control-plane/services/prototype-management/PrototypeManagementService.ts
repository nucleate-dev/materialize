import { S3Client } from '@aws-sdk/client-s3';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  APIResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  CreatePrototypeErrorResponse,
  DeletePrototypeSuccessResponse,
  DeletePrototypeErrorResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { handleCreatePrototypeImpl } from './handlers/handleCreatePrototype.js';
import handleResetPrototypeImpl from './handlers/handleResetPrototype.js';
import handleDeletePrototypeImpl from './handlers/handleDeletePrototype.js';
import { GlideClient } from '@valkey/valkey-glide';
import handleFetchViewingUrlImpl from './handlers/handleFetchViewingUrl.js';
import { DispatcherService } from '../dispatcher/DispatcherService.js';

export class PrototypeManagementService {
  private fastifyApp: FastifyInstance;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private supabaseServiceKey: string;
  private s3Client: S3Client;
  private cache: GlideClient;
  private dispatcherService: DispatcherService;

  constructor(
    fastifyApp: FastifyInstance,
    s3Client: S3Client,
    cache: GlideClient,
    dispatcherService: DispatcherService,
  ) {
    this.fastifyApp = fastifyApp;
    this.s3Client = s3Client;
    this.cache = cache;
    this.dispatcherService = dispatcherService;

    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (
      !this.supabaseUrl ||
      !this.supabaseAnonKey ||
      !this.supabaseServiceKey
    ) {
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
              project_id: { type: 'string' },
              prototype_id: { type: 'string' }, // For forking
              visibility: {
                type: 'string',
                enum: ['PUBLIC', 'SELF'],
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

    app.post<{ Params: { prototype_id: string } }>(
      '/prototype/:prototype_id/reset',
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
      this.handleResetPrototype.bind(this),
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
    return await handleCreatePrototypeImpl(request, reply, this.s3Client);
  }

  private async handleResetPrototype(
    request: FastifyRequest<{ Params: { prototype_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    return await handleResetPrototypeImpl(
      request,
      reply,
      this.s3Client,
      this.dispatcherService,
    );
  }

  private async handleDeletePrototype(
    request: FastifyRequest<{ Params: { prototype_id: string } }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DeletePrototypeSuccessResponse, DeletePrototypeErrorResponse>
  > {
    return await handleDeletePrototypeImpl(
      request,
      reply,
      this.s3Client,
      this.cache,
    );
  }
}
