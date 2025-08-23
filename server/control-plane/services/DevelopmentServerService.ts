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
  FileInput,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import {
  authenticatePrototypeUser,
  checkUserHasPrototypeEditAccess,
} from '../utils/prototypeAuth.js';
import {
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

      // 6. Convert files to build worker format for dispatch (updates only)
      const textFilesForDispatch =
        convertPrototypeFileInputsToFileInputs(files);

      console.log(
        `📦 Update dispatch summary: ${textFilesForDispatch.length} files (updates only)`,
      );

      // 7. Dispatch update request with file_scope: "updates"
      console.log('📦 Dispatching file update request to server');

      const dispatchResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        payload: {
          jwt: jwtToken,
          prototype_id: prototype_id,
          framework: 'expo_react_native',
          files: textFilesForDispatch,
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

      // 8. Return success response with viewing URL
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

      if (!(await checkUserHasPrototypeEditAccess(prototype_id, token))) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: 'Access denied for this prototype',
        } as StandardErrorResponse);
      }

      // 2. Perform dispatch precheck to verify permissions and build status
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        payload: {
          jwt: token,
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      if (precheckResponse.statusCode !== 200) {
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

      // Separate assets from text files from the client-sent files
      // TODO: This should just be passed in from the client as two separate arrays
      const assetFiles = files.filter((file) => file.file_type === 'asset');
      const textFiles = files.filter(
        (file) => file.file_type === 'text' || !file.file_type,
      );

      console.log(
        `🔍 Received ${assetFiles.length} assets from client:`,
        assetFiles.map((a) => a.name),
      );
      console.log(
        `🔍 Received ${textFiles.length} text files from client:`,
        textFiles.map((t) => t.name),
      );

      // Convert assets to build worker format - download from storage and convert to base64
      // TODO: Sourish: move this to the dispatcher
      const assetFilesForDispatch: FileInput[] = [];
      for (const assetFile of assetFiles) {
        if (assetFile.file_type === 'asset' && assetFile.storage_path) {
          console.log(
            `🔍 Converting asset ${assetFile.name} from storage_path: ${assetFile.storage_path}`,
          );
          try {
            const response = await fetch(assetFile.storage_path);
            if (!response.ok) {
              console.error(
                `Failed to fetch asset ${assetFile.name}: ${response.status} ${response.statusText}`,
              );
              continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const base64Content = Buffer.from(arrayBuffer).toString('base64');

            assetFilesForDispatch.push({
              path: assetFile.name,
              content: base64Content,
              isBase64: true,
            });
            console.log(`✅ Successfully converted asset: ${assetFile.name}`);
          } catch (error) {
            console.error(`Error converting asset ${assetFile.name}:`, error);
          }
        }
      }
      console.log(
        `✅ Converted ${assetFilesForDispatch.length} assets for dispatch`,
      );

      // Convert text files to build worker format
      const textFilesForDispatch =
        convertPrototypeFileInputsToFileInputs(textFiles);

      console.log(
        `📦 Dispatch summary: ${textFilesForDispatch.length} text files + ${assetFilesForDispatch.length} assets`,
      );

      // Merge text files + assets for dispatch (all files from client)
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
          jwt: token,
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
