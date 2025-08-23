import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
  StartDevServerErrorResponse,
  UpdateFilesRequestBody,
  UpdateFilesResponse,
  StandardErrorResponse,
  DispatchRequestBody,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  DispatchResponse,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import {
  authenticatePrototypeUser,
  checkUserHasPrototypeEditAccess,
} from '../utils/prototypeAuth.js';
import {
  filterTextFiles,
  convertTextFilesToDatabaseFormat,
  saveFilesToDatabaseWithAuth,
} from '../utils/fileOperations.js';
import { hasExceededUsageLimit } from '../utils/subscriptionChecks.js';

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

  private isBuildInProgress(precheckData: DispatchPrecheckResponse): boolean {
    if ('error' in precheckData) {
      return false;
    }

    return (
      precheckData.status === 'updating' || precheckData.status === 'creating'
    );
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
                  required: ['contents', 'name', 'file_type', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    file_type: { type: 'string', enum: ['text', 'asset'] },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    storage_path: { type: ['string', 'null'] },
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
                  required: ['contents', 'name', 'file_type', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    file_type: { type: 'string', enum: ['text', 'asset'] },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    storage_path: { type: ['string', 'null'] },
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
  }

  private async handleUpdateFiles(
    request: FastifyRequest<{ Body: UpdateFilesRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { files, prototype_id } = request.body;

      console.log('🔍 [update-files] Files:', files.length);
      console.log('🔍 [update-files] Prototype ID:', prototype_id);

      // 1. Authenticate JWT and get user info
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: 'No token provided',
        } as StandardErrorResponse);
      }

      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      const authResult = await authenticatePrototypeUser(supabase, token);
      if (!authResult.success) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: authResult.message || 'Authentication failed',
        } as StandardErrorResponse);
      }

      const jwtToken = token;

      // 2. Perform dispatch precheck to verify permissions and build status
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        payload: {
          jwt: jwtToken,
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      if (precheckResponse.statusCode !== 200) {
        const errorData = JSON.parse(precheckResponse.payload);
        console.error('Dispatch precheck failed:', errorData);

        if (precheckResponse.statusCode === 401) {
          return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: 'Unauthorized',
            message: 'Access denied for this prototype',
          } as StandardErrorResponse);
        }

        if (precheckResponse.statusCode === 404) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            error: 'Prototype not found',
            message: 'The specified prototype could not be found',
          } as StandardErrorResponse);
        }

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Precheck failed',
          message: errorData.message || 'Unknown precheck error',
        } as StandardErrorResponse);
      }

      const precheckData: DispatchPrecheckResponse = JSON.parse(
        precheckResponse.payload,
      );

      console.log(
        '🔍 [update-files] Dispatch precheck response:',
        precheckData,
      );

      // 3. Check if build is already in progress
      if (this.isBuildInProgress(precheckData)) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          error: 'Build already in progress',
          message:
            'A dev server operation is currently in progress for this prototype. Please wait for it to complete.',
        } as StandardErrorResponse);
      }

      // 4. Check if there's an active dev server to update
      if ('success' in precheckData && precheckData.state === 'dne') {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          error: 'No active dev server',
          message:
            'No active dev server found for this prototype. Please start a dev server first.',
        } as StandardErrorResponse);
      }

      // 5. Save only text files to database (don't overwrite existing assets)
      const textFilesOnly = filterTextFiles(files);
      const textFilesWithType = convertTextFilesToDatabaseFormat(textFilesOnly);

      console.log(
        `🔍 [update-files] Saving ${
          Object.keys(textFilesWithType).length
        } text files to database for prototype ${prototype_id} (filtered from ${
          files.length
        } total files)`,
      );

      try {
        await saveFilesToDatabaseWithAuth(
          jwtToken,
          prototype_id,
          textFilesWithType,
        );
      } catch (saveError) {
        console.error('Error saving files to database:', saveError);
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Failed to save files',
          message:
            saveError instanceof Error ? saveError.message : 'Unknown error',
        } as StandardErrorResponse);
      }

      // 6. Dispatch update request with file_scope: "updates"
      console.log('📦 Dispatching file update request to server');

      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        payload: {
          jwt: jwtToken,
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: files,
          assets: [], // update-files only deals with text files, so assets array is empty
          file_scope: 'updates', // This is the key difference - only update files, don't rebuild
        } as DispatchRequestBody,
      });

      if (dispatchResponse.statusCode !== 200) {
        const errorData = JSON.parse(dispatchResponse.payload);
        console.error('Dispatch request failed:', errorData);

        if (dispatchResponse.statusCode === 401) {
          return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: 'Unauthorized',
            message: 'Authentication failed during dispatch',
          } as StandardErrorResponse);
        }

        if (dispatchResponse.statusCode === 404) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            error: 'Prototype not found',
            message: 'Prototype not found during dispatch',
          } as StandardErrorResponse);
        }

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'File update failed',
          message: errorData.message || 'Unknown file update error',
          build_errors: errorData.build_errors || [],
          build_warnings: errorData.build_warnings || [],
        } as UpdateFilesResponse);
      }

      const dispatchData: DispatchResponse = JSON.parse(
        dispatchResponse.payload,
      );

      console.log('📦 Dispatch endpoint response:', dispatchData);

      // 7. Return success response with viewing URL
      if ('status' in dispatchData && dispatchData.status === 'success') {
        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          status: dispatchData.status,
          viewing_url: dispatchData.viewing_url,
          build_errors: dispatchData.build_errors || [],
          build_warnings: dispatchData.build_warnings || [],
          message: 'Files updated successfully in dev server',
        } as UpdateFilesResponse);
      } else {
        // Handle error response
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'File update failed',
          message:
            'error' in dispatchData
              ? dispatchData.error
              : 'Unknown file update error',
          build_errors:
            'build_errors' in dispatchData ? dispatchData.build_errors : [],
          build_warnings:
            'build_warnings' in dispatchData ? dispatchData.build_warnings : [],
        } as UpdateFilesResponse);
      }
    } catch (error) {
      console.error('Update files API error:', error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } as StandardErrorResponse);
    }
  }

  private async handleStartDevServer(
    request: FastifyRequest<{ Body: StartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { files, assets, prototype_id } = request.body;

      console.log('🔍 [start-dev-server] Files:', files.length);
      console.log('🔍 [start-dev-server] Assets:', assets.length);
      console.log('🔍 [start-dev-server] Prototype ID:', prototype_id);

      // 1. Authenticate JWT and get user info
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: 'No token provided',
        } as StandardErrorResponse);
      }
      const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
      );
      if (authResponse === null || !authResponse.canEdit) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: 'Access denied for this prototype',
        } as StandardErrorResponse);
      }

      // 2. Paywall check this user
      const exceededUsageLimit = await hasExceededUsageLimit(
        token,
        authResponse.user.id,
      );
      if (exceededUsageLimit.exceeded) {
        return reply.status(HTTP_STATUS.PAYMENT_REQUIRED).send({
          error: 'Payment required',
          message:
            'You have reached your monthly usage limit. Please upgrade to a paid plan to continue.',
        } as StandardErrorResponse);
      }

      // 3. Perform dispatch precheck to verify permissions and build status
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        payload: {
          jwt: token,
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      if (precheckResponse.statusCode !== HTTP_STATUS.OK) {
        const errorData = JSON.parse(precheckResponse.payload);
        console.error('Dispatch precheck failed:', errorData);

        if (precheckResponse.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: 'Unauthorized',
            message: 'Access denied for this prototype',
          } as StandardErrorResponse);
        }

        if (precheckResponse.statusCode === HTTP_STATUS.NOT_FOUND) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            error: 'Prototype not found',
            message: 'The specified prototype could not be found',
          } as StandardErrorResponse);
        }

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Precheck failed',
          message: errorData.message || 'Unknown precheck error',
        } as StandardErrorResponse);
      }

      const precheckData: DispatchPrecheckResponse = JSON.parse(
        precheckResponse.payload,
      );

      console.log(
        '🔍 [start-dev-server] Dispatch precheck response:',
        precheckData,
      );

      // 3. Check if dev server already exists
      if (
        'state' in precheckData &&
        precheckData.state === 'active_dev_server'
      ) {
        console.log("There's already an active dev server for this prototype");
        return reply.status(HTTP_STATUS.CONFLICT).send({
          error: 'Active dev server already exists',
          message:
            'A dev server is currently starting for this prototype. Please wait for it to complete.',
        } as StartDevServerErrorResponse);
      }

      // Process assets and text files separately (now passed as separate arrays)
      console.log(
        `🔍 Received ${assets.length} assets from client:`,
        assets.map((a) => a.name),
      );
      console.log(
        `🔍 Received ${files.length} text files from client:`,
        files.map((t) => t.name),
      );

      // 6. Dispatch dev server start request
      console.log('📦 Dispatching dev server start request to server');

      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        payload: {
          jwt: token,
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: files,
          assets: assets,
          file_scope: 'complete', // all start-dev-server requests must have complete file scope
        } as DispatchRequestBody,
      });

      if (dispatchResponse.statusCode !== HTTP_STATUS.OK) {
        const errorData = JSON.parse(dispatchResponse.payload);
        console.error('Dispatch request failed:', errorData);

        if (dispatchResponse.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: 'Unauthorized',
            message: 'Authentication failed during dispatch',
          } as StartDevServerErrorResponse);
        }

        if (dispatchResponse.statusCode === HTTP_STATUS.NOT_FOUND) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            error: 'Prototype not found',
            message: 'Prototype not found during dispatch',
          } as StartDevServerErrorResponse);
        }

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Dev server start failed',
          message: errorData.message || 'Unknown dispatch error',
          build_errors: [],
          build_warnings: [],
        } as StartDevServerErrorResponse);
      }

      const dispatchData: DispatchResponse = JSON.parse(
        dispatchResponse.payload,
      );

      console.log('📦 Dispatch endpoint response:', dispatchData);

      // 7. Return success response with viewing URL
      if ('status' in dispatchData && dispatchData.status === 'success') {
        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          status: dispatchData.status,
          viewing_url: dispatchData.viewing_url,
          message: 'Files saved and dev server started successfully',
        } as StartDevServerSuccessResponse);
      } else {
        // Handle error response
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Dev server start failed',
          message:
            'error' in dispatchData
              ? dispatchData.error
              : 'Unknown dispatch error',
        } as StartDevServerErrorResponse);
      }
    } catch (error) {
      console.error('Start dev server API error:', error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } as StartDevServerErrorResponse);
    }
  }
}
