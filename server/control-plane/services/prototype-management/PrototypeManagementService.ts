import { S3Client } from '@aws-sdk/client-s3';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  DeletePrototypeResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';
import { handleCreatePrototypeImpl } from './handleCreatePrototype.js';
import handleResetPrototypeImpl from './handleResetPrototype.js';
import handleDeletePrototypeImpl from './handleDeletePrototype.js';

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
    return await handleDeletePrototypeImpl(request, reply, this.s3Client);
  }
}
