import { S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  DeletePrototypeResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  DispatchRequestBody,
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import type { Database } from '../../types/supabase.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';
import {
  cleanupPrototypeS3Objects,
  copyDefaultAppToVersionedPrototype,
  deletePrototypeAssetsFromStorage,
  getDefaultAppFilesFromS3,
} from '../../utils/s3Operations.js';
import { handleCreatePrototypeImpl } from './handleCreatePrototype.js';
import { PrototypeAssetInsert } from '../../types/InternalTypes.js';
import handleResetPrototypeImpl from './handleResetPrototype.js';

export class PrototypeManagementService {
  private fastifyApp: FastifyInstance;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private supabaseServiceKey: string;
  private s3Client: S3Client;

  constructor(fastifyApp: FastifyInstance, s3Client: S3Client) {
    this.fastifyApp = fastifyApp;
    this.s3Client = s3Client;

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
  ): Promise<FetchViewingUrlResponse> {
    try {
      // Extract validated body (validation handled by Fastify schema)
      const { prototype_id, current_page } = request.body;

      // Get JWT token if provided (optional for this endpoint) and validate user access
      const token = request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.split(' ')[1]
        : undefined;
      const authResult = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
      );
      if (
        authResult === null ||
        authResult.user === null ||
        authResult.prototype === null
      ) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'UNAUTHORIZED',
          message: 'Access denied for this prototype',
        });
      }

      // Check if user is prototype owner and current_page is 'edit'
      if (authResult.canEdit && current_page === 'edit') {
        try {
          // Fetch dispatch-precheck from control plane
          const precheckResponse = await this.fastifyApp.inject({
            method: 'POST',
            url: '/dispatch-precheck',
            headers: {
              'Content-Type': 'application/json',
              'x-trace-id': request.log2.getTraceId(),
            },
            payload: {
              jwt: token,
              prototype_id: prototype_id,
            } as DispatchPrecheckRequestBody,
          });

          if (precheckResponse.statusCode === 200) {
            const precheckData: DispatchPrecheckResponse =
              precheckResponse.json();

            // Type guard to check if it's a success response
            if (
              'success' in precheckData &&
              precheckData.success &&
              precheckData.viewing_url
            ) {
              const isEditable = isEditableDevServer(precheckData.status);
              let staticViewingUrl = precheckData.viewing_url;
              if (
                !isEditable &&
                token &&
                authResult.prototype.visibility !== 'PUBLIC' &&
                staticViewingUrl.includes('render.materializeui.com')
              ) {
                staticViewingUrl += `?token=${encodeURIComponent(token)}`;
              }
              const successResponse: FetchViewingUrlSuccessResponse = {
                viewing_url: staticViewingUrl,
                source: isEditable ? 'editable_instance' : 'static_build',
                status: precheckData.status,
              };
              return reply.status(HTTP_STATUS.OK).send(successResponse);
            }
          }
        } catch (precheckError) {
          request.log2.warn(
            'Failed to fetch dispatch precheck, falling back to static build:',
            { precheckError },
          );
          // Continue to static build fallback
        }
      }

      // Return static build URL
      let staticViewingUrl = `https://${prototype_id}.render.materializeui.com/`;
      if (token && authResult.prototype.visibility !== 'PUBLIC') {
        staticViewingUrl += `?token=${encodeURIComponent(token)}`;
      }
      request.log2.consoleLogDevOnly(
        'info',
        'Returning static build URL ' + staticViewingUrl,
      );

      const successResponse: FetchViewingUrlSuccessResponse = {
        viewing_url: staticViewingUrl,
        source: 'static_build',
        status: null,
      };

      return reply.status(HTTP_STATUS.OK).send(successResponse);
    } catch (error) {
      request.log2.error(error, 'Fetch viewing URL error:');
      const errorResponse: StandardErrorResponse = {
        error: 'Internal Server Error',
        message: 'Internal server error',
      };
      return reply
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send(errorResponse);
    }
  }

  private async handleCreatePrototype(
    request: FastifyRequest<{ Body: CreatePrototypeRequestBody }>,
    reply: FastifyReply,
  ): Promise<CreatePrototypeResponse> {
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
      this.fastifyApp,
    );
  }

  private async handleDeletePrototype(
    request: FastifyRequest<{ Params: { prototype_id: string } }>,
    reply: FastifyReply,
  ): Promise<DeletePrototypeResponse> {
    try {
      const { prototype_id } = request.params;
      // 1. Get JWT token and validate authentication
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'No authentication token provided',
        });
      }

      // 2. Check if user has edit access for the prototype
      const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
      );
      if (authResponse === null || !authResponse.canEdit) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Access denied for this prototype',
        });
      }

      // 3. Create Supabase client for database operations
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

      // 4. Delete S3 builds for the prototype
      try {
        await cleanupPrototypeS3Objects(
          this.s3Client,
          prototype_id,
          request.log2,
        );
      } catch (s3Error) {
        request.log2.error(s3Error, 'Failed to delete S3 builds for prototype');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'S3_ERROR',
          message: 'Failed to delete S3 builds for prototype',
        });
      }

      // 5. Delete prototype assets from storage
      try {
        await deletePrototypeAssetsFromStorage(prototype_id, request.log2);
      } catch (assetError) {
        request.log2.error(
          assetError,
          'Failed to delete prototype assets from storage',
        );
      }

      // 5.5. Delete the prototype thumbnail from Supabase Storage
      try {
        const supabaseClient = createClient<Database>(
          this.supabaseUrl,
          this.supabaseServiceKey,
        );

        const { error: thumbnailDeleteError } = await supabaseClient.storage
          .from('prototype-thumbnails')
          .remove([`${prototype_id}.png`]);

        if (thumbnailDeleteError) {
          request.log2.warn(
            'Failed to delete prototype thumbnail from storage (non-critical)',
            { error: thumbnailDeleteError },
          );
        } else {
          request.log2.info(
            'Successfully deleted prototype thumbnail from storage',
          );
        }
      } catch (thumbnailError) {
        request.log2.warn(
          'Failed to delete prototype thumbnail from storage (non-critical)',
          { error: thumbnailError },
        );
      }

      // 6. Delete the prototype from prototypes table (will cascade delete all associated prototype_files, prototype_assets, chat sessions, and messages)
      const { error: prototypeDeleteError } = await supabase
        .from('prototypes')
        .delete()
        .eq('id', prototype_id);

      if (prototypeDeleteError) {
        request.log2.error(
          prototypeDeleteError,
          'Failed to delete prototype from database',
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'DATABASE_ERROR',
          message: 'Failed to delete prototype from database',
        });
      }

      // 7. Return success response
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message: 'Prototype and all associated data deleted successfully',
      });
    } catch (error) {
      request.log2.error(error, 'Prototype deletion error');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
