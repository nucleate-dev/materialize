import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
  UpdateFilesRequestBody,
  UpdateFilesSuccessResponse,
  UpdateFilesErrorResponse,
  StandardErrorResponse,
  APIResponse,
  DispatchRequestBody,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  DispatchPrecheckErrorResponse,
  DispatchSuccessResponse,
  RestartDevServerRequestBody,
  RestartDevServerSuccessResponse,
} from '../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../utils/prototypeAuth.js';
import { hasExceededChatUsageLimit } from '../utils/subscriptionChecks.js';
import {
  isDispatchInProgress,
  isEditableDevServer,
} from '../utils/prototypeDevServerStatusUtils.js';

export class DevelopmentServerService {
  private fastifyApp: FastifyInstance;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private supabaseServiceKey: string;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;

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
        'Missing required Supabase environment variables for DevelopmentServerService',
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /files/update-files
    app.post<{
      Body: UpdateFilesRequestBody;
    }>(
      '/files/update-files',
      {
        schema: {
          body: {
            type: 'object',
            required: ['files', 'prototype_id'],
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['contents', 'name', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleUpdateFiles.bind(this),
    );

    // POST /files/start-dev-server
    app.post<{
      Body: StartDevServerRequestBody;
    }>(
      '/files/start-dev-server',
      {
        schema: {
          body: {
            type: 'object',
            required: ['files', 'assets', 'prototype_id'],
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['contents', 'name', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              assets: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['name', 'storage_url', 'prototype_id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    storage_url: { type: 'string' },
                    prototype_id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleStartDevServer.bind(this),
    );

    // POST /dev-server/restart
    app.post<{ Body: RestartDevServerRequestBody }>(
      '/dev-server/restart',
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
      this.handleRestartDevServer.bind(this),
    );
  }

  private async handleRestartDevServer(
    request: FastifyRequest<{ Body: RestartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<RestartDevServerSuccessResponse, StandardErrorResponse>
  > {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token || !request.headers.authorization?.startsWith('Bearer')) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'No token provided',
        } as StandardErrorResponse,
      });
    }

    const restartResponse = await this.fastifyApp.inject({
      method: 'POST',
      url: '/dispatch-restart',
      headers: {
        'x-trace-id': request.log2.getTraceId(),
        authorization: `Bearer ${token}`,
      },
    });
    const restartData: APIResponse<
      RestartDevServerSuccessResponse,
      StandardErrorResponse
    > = JSON.parse(restartResponse.payload);
    reply.status(restartResponse.statusCode);
    return restartData;
  }

  private async handleUpdateFiles(
    request: FastifyRequest<{ Body: UpdateFilesRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<UpdateFilesSuccessResponse, UpdateFilesErrorResponse>
  > {
    request.log2.consoleLogDevOnly(
      'info',
      '[handleUpdateFiles] Starting update files',
    );
    try {
      const { files, prototype_id } = request.body;

      // 1. Get JWT
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          data: null,
          error: {
            error: 'Unauthorized',
            message: 'No token provided',
          } as StandardErrorResponse,
        });
      }

      // 2. Perform dispatch precheck to authenticate user JWT, verify permissions, and check build status
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
          authorization: `Bearer ${token}`,
        },
        payload: {
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });
      if (precheckResponse.statusCode !== HTTP_STATUS.OK) {
        const errorData = JSON.parse(precheckResponse.payload);
        request.log2.error(
          errorData,
          '[handleUpdateFiles] Dispatch precheck failed:',
        );
        return reply.status(precheckResponse.statusCode).send({
          data: null,
          error: {
            error: errorData.error,
            message: errorData.message,
          } as StandardErrorResponse,
        });
      }

      const precheckData: APIResponse<
        DispatchPrecheckSuccessResponse,
        DispatchPrecheckErrorResponse
      > = JSON.parse(precheckResponse.payload);
      request.log2.consoleLogDevOnly(
        'info',
        '🔍 [handleUpdateFiles] Dispatch precheck response:',
        { precheckData },
      );

      // 3. Check if build is already in progress
      if (precheckData.data && isDispatchInProgress(precheckData.data.status)) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          data: null,
          error: {
            error: 'Build already in progress',
            message:
              'A dev server operation is currently in progress for this prototype. Please wait for it to complete.',
          },
        });
      }

      // 4. Check if there's an active dev server to update
      if (precheckData.data && !isEditableDevServer(precheckData.data.status)) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'No active dev server',
            message:
              'No active dev server found for this prototype. Please start a dev server first.',
          } as StandardErrorResponse,
        });
      }

      // 5. Dispatch update request with file_scope: "updates"
      request.log2.consoleLogDevOnly(
        'info',
        '[handleUpdateFiles]Dispatching file update request to server',
      );

      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
          authorization: `Bearer ${token}`,
        },
        payload: {
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: files,
          assets: [], // update-files only deals with text files, so assets array is empty
          file_scope: 'updates', // This is the key difference - only update files, don't rebuild
        } as DispatchRequestBody,
      });

      if (dispatchResponse.statusCode !== HTTP_STATUS.OK) {
        const errorData = JSON.parse(dispatchResponse.payload);
        request.log2.consoleLogDevOnly(
          'error',
          '[update-files]Dispatch request failed:',
          {
            errorData,
          },
        );
        return reply.status(dispatchResponse.statusCode).send({
          data: null,
          error: {
            error: errorData.error,
            message: errorData.message,
          } as StandardErrorResponse,
        });
      }

      const dispatchData: APIResponse<
        DispatchSuccessResponse,
        StandardErrorResponse
      > = JSON.parse(dispatchResponse.payload);
      request.log2.consoleLogDevOnly(
        'info',
        '[handleUpdateFiles] Dispatch endpoint response:',
        { dispatchData },
      );

      // 6. Return success response with viewing URL
      if (dispatchData.data) {
        return reply.status(HTTP_STATUS.OK).send({
          data: {
            success: true,
            status: 'success',
            viewing_url: dispatchData.data.viewing_url,
            build_errors: dispatchData.data.build_errors || [],
            build_warnings: dispatchData.data.build_warnings || [],
            message: 'Files updated successfully in dev server',
          } as UpdateFilesSuccessResponse,
          error: null,
        });
      } else {
        // Handle error response
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'File update failed',
            message: 'File update failed',
            build_errors: [],
            build_warnings: [],
          } as UpdateFilesErrorResponse,
        });
      }
    } catch (error) {
      request.log2.consoleLogDevOnly(
        'error',
        '[handleUpdateFiles] Update files API error:',
        { error },
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        } as StandardErrorResponse,
      });
    }
  }

  private async handleStartDevServer(
    request: FastifyRequest<{ Body: StartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<StartDevServerSuccessResponse, StandardErrorResponse>
  > {
    try {
      const { files, assets, prototype_id } = request.body;

      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Starting start dev server',
        {
          filesLength: files.length,
          assetsLength: assets.length,
          prototypeId: prototype_id,
        },
      );

      // 1. Authenticate JWT and get user info
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return {
          data: null,
          error: {
            error: 'Unauthorized',
            message: 'No token provided',
          },
        };
      }
      const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
      );
      if (authResponse === null || !authResponse.canEdit) {
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return {
          data: null,
          error: {
            error: 'Unauthorized',
            message: 'Access denied for this prototype',
          },
        };
      }

      // 2. Paywall check this user
      const exceededUsageLimit = await hasExceededChatUsageLimit(
        token,
        authResponse.user.id,
        request.log2,
      );
      if (exceededUsageLimit.exceeded) {
        reply.status(HTTP_STATUS.PAYMENT_REQUIRED);
        return {
          data: null,
          error: {
            error: 'Payment required',
            message:
              'You have reached your monthly usage limit. Please upgrade to a paid plan to continue.',
          },
        };
      }

      // 3. Perform dispatch precheck to verify permissions and build status
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
          authorization: `Bearer ${token}`,
        },
        payload: {
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });
      if (precheckResponse.statusCode !== HTTP_STATUS.OK) {
        const precheckResponsePayload = JSON.parse(precheckResponse.payload);
        request.log2.consoleLogDevOnly(
          'error',
          '[handleStartDevServer] Dispatch precheck failed:',
          { precheckResponsePayload },
        );
        reply.status(precheckResponse.statusCode);
        return {
          data: null,
          error: {
            error: precheckResponsePayload.error,
            message: precheckResponsePayload.message,
          },
        };
      }

      const precheckData: APIResponse<
        DispatchPrecheckSuccessResponse,
        DispatchPrecheckErrorResponse
      > = JSON.parse(precheckResponse.payload);
      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatch precheck response:',
        { precheckData },
      );

      // 3. Check if dev server already exists
      if (precheckData.data && isEditableDevServer(precheckData.data.status)) {
        request.log2.consoleLogDevOnly(
          'info',
          "[handleStartDevServer] There's already an active dev server for this prototype",
        );
        reply.status(HTTP_STATUS.CONFLICT);
        return {
          data: null,
          error: {
            error: 'Active dev server already exists',
            message:
              'A dev server is currently starting for this prototype. Please wait for it to complete.',
          },
        };
      }

      // 6. Dispatch dev server start request
      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatching dev server start request to server',
      );
      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
          authorization: `Bearer ${token}`,
        },
        payload: {
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: files,
          assets: assets,
          file_scope: 'complete', // all start-dev-server requests must have complete file scope
        } as DispatchRequestBody,
      });
      if (dispatchResponse.statusCode !== HTTP_STATUS.OK) {
        const errorData = JSON.parse(dispatchResponse.payload);
        request.log2.error(
          errorData,
          '[handleStartDevServer] Dispatch request failed:',
        );
        reply.status(dispatchResponse.statusCode);
        return {
          data: null,
          error: {
            error: errorData.error,
            message: errorData.message,
          },
        };
      }

      const dispatchData: APIResponse<
        DispatchSuccessResponse,
        StandardErrorResponse
      > = JSON.parse(dispatchResponse.payload);
      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatch endpoint response:',
        { dispatchData },
      );

      // 7. Return success response with viewing URL
      if (dispatchData.data) {
        reply.status(HTTP_STATUS.OK);
        return {
          data: {
            success: true,
            status: 'success',
            viewing_url: dispatchData.data.viewing_url,
            message: 'Files saved and dev server started successfully',
          },
          error: null,
        };
      } else {
        // Handle error response
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: 'Dev server start failed',
            message: 'Dev server start failed',
          },
        };
      }
    } catch (error) {
      request.log2.consoleLogDevOnly(
        'error',
        '[handleStartDevServer] Start dev server API error:',
        { error },
      );
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
