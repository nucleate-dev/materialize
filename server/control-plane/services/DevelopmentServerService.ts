import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
  StartDevServerErrorResponse,
  StandardErrorResponse,
  DispatchRequestBody,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  DispatchResponse,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import {
  authenticatePrototypeUser,
  getPrototypeFiles,
} from '../utils/prototypeAuth.js';
import {
  convertPrototypeFilesForBuildWorker,
  convertPrototypeFileInputsToFileInputs,
  filterTextFiles,
  convertTextFilesToDatabaseFormat,
  saveFilesToDatabaseWithAuth,
} from '../utils/fileOperations.js';

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
    // POST /files/start-dev-server
    app.post<{
      Body: StartDevServerRequestBody;
    }>(
      '/files/start-dev-server',
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
              file_scope: { type: 'string', enum: ['updates', 'complete'] },
            },
          },
        },
      },
      this.handleStartDevServer.bind(this),
    );
  }

  private async handleStartDevServer(
    request: FastifyRequest<{ Body: StartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { files, prototype_id, file_scope = 'complete' } = request.body;

      console.log('🔍 [start-dev-server] Files:', files.length);
      console.log('🔍 [start-dev-server] Prototype ID:', prototype_id);
      console.log('🔍 [start-dev-server] File scope:', file_scope);

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
        '🔍 [start-dev-server] Dispatch precheck response:',
        precheckData,
      );

      // 3. Check if build is already in progress
      if (this.isBuildInProgress(precheckData)) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          error: 'Build already in progress',
          message:
            'A dev server is currently starting for this prototype. Please wait for it to complete.',
        } as StartDevServerErrorResponse);
      }

      // 4. Save only text files to database (don't overwrite existing assets)
      const textFilesOnly = filterTextFiles(files);
      const textFilesWithType = convertTextFilesToDatabaseFormat(textFilesOnly);

      console.log(
        `🔍 [start-dev-server] Saving ${
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
        } as StartDevServerErrorResponse);
      }

      // 5. Prepare files for dispatch API - merge changed text files with existing assets
      const supabaseClient = createClient<Database>(
        this.supabaseUrl,
        this.supabaseAnonKey,
        {
          global: {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
            },
          },
        },
      );

      // Get existing files to find assets
      const prototypeFilesResult = await getPrototypeFiles(
        supabaseClient,
        prototype_id,
      );

      if (!prototypeFilesResult.success || !prototypeFilesResult.files) {
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Failed to fetch prototype files',
          message:
            prototypeFilesResult.message ||
            'Could not retrieve all files for dev server',
        } as StartDevServerErrorResponse);
      }

      // Separate assets from text files
      const existingAssets = prototypeFilesResult.files.filter(
        (file) => file.file_type === 'asset',
      );
      console.log(
        `🔍 Found ${existingAssets.length} existing assets:`,
        existingAssets.map((a) => a.name),
      );

      // Convert existing assets to build worker format
      const assetFilesForDispatch = await convertPrototypeFilesForBuildWorker(
        existingAssets,
      );
      console.log(
        `✅ Converted ${assetFilesForDispatch.length} assets for dispatch`,
      );

      // Convert changed text files to build worker format
      const textFilesForDispatch =
        convertPrototypeFileInputsToFileInputs(files);

      console.log(
        `📦 Dispatch summary: ${textFilesForDispatch.length} text files + ${assetFilesForDispatch.length} assets`,
      );

      // Merge text files + assets for dispatch (preserves hot reload + includes assets)
      const filesForDispatch = [
        ...textFilesForDispatch,
        ...assetFilesForDispatch,
      ];

      // 6. Dispatch dev server start request
      console.log('📦 Dispatching dev server start request to server');

      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        payload: {
          jwt: jwtToken,
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: filesForDispatch,
          file_scope: file_scope,
        } as DispatchRequestBody,
      });

      if (dispatchResponse.statusCode !== 200) {
        const errorData = JSON.parse(dispatchResponse.payload);
        console.error('Dispatch request failed:', errorData);

        if (dispatchResponse.statusCode === 401) {
          return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: 'Unauthorized',
            message: 'Authentication failed during dispatch',
          } as StartDevServerErrorResponse);
        }

        if (dispatchResponse.statusCode === 404) {
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
      let successResponse: StartDevServerSuccessResponse;

      if ('status' in dispatchData && dispatchData.status === 'success') {
        successResponse = {
          success: true,
          status: dispatchData.status,
          viewing_url: dispatchData.viewing_url,
          build_errors: dispatchData.build_errors || [],
          build_warnings: dispatchData.build_warnings || [],
          message: 'Files saved and dev server started successfully',
        };
      } else {
        // Handle error response
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Dev server start failed',
          message:
            'error' in dispatchData
              ? dispatchData.error
              : 'Unknown dispatch error',
          build_errors: [],
          build_warnings: [],
        } as StartDevServerErrorResponse);
      }

      return reply.status(HTTP_STATUS.OK).send(successResponse);
    } catch (error) {
      console.error('Start dev server API error:', error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } as StartDevServerErrorResponse);
    }
  }
}
