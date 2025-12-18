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
import { CleanupService } from '../cleanup/CleanupService.js';
import { DispatcherService } from '../dispatcher/DispatcherService.js';
import { handleCreatePrototypeImpl } from './handlers/handleCreatePrototype.js';
import handleDeletePrototypeImpl from './handlers/handleDeletePrototype.js';
import handleFetchViewingUrlImpl from './handlers/handleFetchViewingUrl.js';

export class PrototypeManagementService {
  private fastifyApp: FastifyInstance;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private s3Client: S3Client;
  private cache: GlideClient;
  private dispatcherService: DispatcherService;
  private cleanupService: CleanupService;

  constructor(
    fastifyApp: FastifyInstance,
    s3Client: S3Client,
    cache: GlideClient,
    dispatcherService: DispatcherService,
    cleanupService: CleanupService,
  ) {
    this.fastifyApp = fastifyApp;
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
    return await handleCreatePrototypeImpl(request, reply, this.s3Client);
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
      this.cleanupService,
    );
  }
}
