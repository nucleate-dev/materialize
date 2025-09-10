import { S3Client } from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  PrototypeAssetInsert,
  PrototypeFileInsert,
} from '../types/InternalTypes.js';
import type {
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  DeletePrototypeResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from '../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import {
  checkUserHasPrototypeEditAccess,
  validateJWTToken,
} from '../utils/prototypeAuth.js';
import { isEditableDevServer } from '../utils/prototypeDevServerStatusUtils.js';
import {
  cleanupPrototypeS3Objects,
  copyAssetInSupabaseStorage,
  copyDefaultAppToVersionedPrototype,
  copyS3BucketContentsVersioned,
  deletePrototypeAssetsFromStorage,
  getDefaultAppFilesFromS3,
  getPrototypeViewingUrl,
} from '../utils/s3Operations.js';
import { hasExceededPrototypeCreationLimit } from '../utils/subscriptionChecks.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

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
              const successResponse: FetchViewingUrlSuccessResponse = {
                viewing_url: precheckData.viewing_url,
                source: isEditableDevServer(precheckData.status)
                  ? 'editable_instance'
                  : 'static_build',
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
      request.log2.consoleLogDevOnly('info', 'Returning static build URL');
      const staticViewingUrl = `https://${prototype_id}.render.materializeui.com/`;

      const successResponse: FetchViewingUrlSuccessResponse = {
        viewing_url: staticViewingUrl,
        source: 'static_build',
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
    try {
      // 1. JWT Token validation and user authentication
      const token = request.headers.authorization?.split(' ')[1] ?? '';
      const user = await validateJWTToken(token, request.log2);
      if (!user) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Invalid authentication token',
        });
      }
      // update logger context
      request.log2 = request.log2.child({
        userId: user.id,
      });

      // 2. Check prototype limits for free users (5 max)
      const limitCheck = await hasExceededPrototypeCreationLimit(
        token,
        user.id,
        request.log2,
      );
      if (limitCheck.exceeded) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: 'PROTOTYPE_LIMIT_REACHED',
          message: 'Prototype limit reached',
        });
      }

      // 3. Extract validated body (validation handled by Fastify schema)
      const {
        name,
        description,
        project_id,
        prototype_id: forkPrototypeId, // If provided, this is a fork
        visibility,
      } = request.body;

      if (visibility === 'SELF' && limitCheck.plan === 'free') {
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Self-visibility is only available for Pro users',
        };
        reply.status(HTTP_STATUS.BAD_REQUEST);
        return errorResponse;
      }

      // 4. Create prototype in database
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
      const { data: newPrototype, error: prototypeInsertError } = await supabase
        .from('prototypes')
        .insert({
          name,
          description,
          owner_id: user.id,
          project_id,
          visibility:
            visibility || (limitCheck.plan === 'pro' ? 'SELF' : 'PUBLIC'),
        })
        .select()
        .single();

      if (prototypeInsertError) {
        request.log2.error(
          prototypeInsertError,
          '[handleCreatePrototype] Error creating prototype:',
        );
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'DATABASE_ERROR',
          message: 'Failed to create prototype in database',
        };
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return errorResponse;
      }

      const newPrototypeId = newPrototype.id;
      try {
        // 5. Handle prototype files and S3 operations
        if (forkPrototypeId) {
          await this.forkPrototype(
            supabase,
            forkPrototypeId,
            newPrototypeId,
            request.log2,
          );
        } else {
          await this.createNewPrototype(supabase, newPrototypeId, request.log2);
        }

        // 6. Get viewing URL and return success
        const viewingUrl = getPrototypeViewingUrl(newPrototypeId);
        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          data: {
            prototype_id: newPrototypeId,
            viewing_url: viewingUrl,
          },
        });
      } catch (error) {
        // If anything fails after prototype creation, clean up
        request.log2.error(error, 'Error during prototype setup:');

        // Clean up S3 objects
        await cleanupPrototypeS3Objects(
          this.s3Client,
          newPrototypeId,
          request.log2,
        );

        // Clean up Supabase Storage assets
        await deletePrototypeAssetsFromStorage(newPrototypeId, request.log2);

        // Clean up database entry
        await supabase.from('prototypes').delete().eq('id', newPrototypeId);

        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'S3_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to set up prototype files and S3 storage',
        };

        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return errorResponse;
      }
    } catch (error) {
      request.log2.error(error, '[handleCreatePrototype] Unexpected error:');
      const errorResponse: CreatePrototypeErrorResponse = {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'An unexpected error occurred',
      };

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return errorResponse;
    }
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

      // TODO: Delete the prototype_thumbnail from supabase storage

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

  /**
   * Helper function to fork an existing prototype
   */
  private async forkPrototype(
    supabase: SupabaseClient<Database>,
    sourcePrototypeId: string,
    newPrototypeId: string,
    log2: SystemLogger,
  ): Promise<void> {
    log2.consoleLogDevOnly(
      'info',
      `Forking prototype ${sourcePrototypeId} to ${newPrototypeId}`,
    );
    // 1. Get files from source prototype and copy to new prototype
    const { data: files, error: filesError } = await supabase
      .from('prototype_files')
      .select('*')
      .eq('prototype_id', sourcePrototypeId);
    if (filesError) {
      log2.error(filesError, '[forkPrototype] Failed to fetch prototype files');
      throw new Error(filesError.message || 'Failed to get prototype files');
    }

    const filesToInsert: PrototypeFileInsert[] = [];
    for (const file of files) {
      filesToInsert.push({
        prototype_id: newPrototypeId,
        name: file.name,
        contents: file.contents,
      });
    }
    const { error: filesInsertError } = await supabase
      .from('prototype_files')
      .insert(filesToInsert);
    if (filesInsertError) {
      log2.error(filesInsertError, '[forkPrototype] Failed to insert files');
      await supabase
        .from('prototype_files')
        .delete()
        .eq('prototype_id', newPrototypeId);
      throw new Error(
        `Failed to copy prototype files: ${filesInsertError.message}`,
      );
    }
    log2.consoleLogDevOnly(
      'info',
      `[forkPrototype] Successfully inserted ${filesToInsert.length} files to database`,
    );

    // 2. Get assets from source prototype and copy to new prototype
    const { data: assets, error: assetsFetchError } = await supabase
      .from('prototype_assets')
      .select('*')
      .eq('prototype_id', sourcePrototypeId);
    if (assetsFetchError) {
      log2.error(
        assetsFetchError,
        '[forkPrototype] Failed to fetch prototype assets',
      );
      throw new Error(
        assetsFetchError.message || 'Failed to get prototype assets',
      );
    }

    const assetsToInsert: PrototypeAssetInsert[] = [];
    for (const asset of assets) {
      // TODO: Copy the asset to a new supabase storage folder and update the storage_url.
      // const assetContents = await getAss(this.s3Client, asset.storage_url);
      const uploadResult = await copyAssetInSupabaseStorage(
        sourcePrototypeId,
        newPrototypeId,
        asset.name,
        log2,
      );
      if (!uploadResult.success || !uploadResult.publicUrl) {
        log2.error(uploadResult, '[forkPrototype] Failed to copy asset');
        await deletePrototypeAssetsFromStorage(newPrototypeId, log2);
        await supabase
          .from('prototype_assets')
          .delete()
          .eq('prototype_id', newPrototypeId);
        await supabase
          .from('prototype_files')
          .delete()
          .eq('prototype_id', newPrototypeId);
        throw new Error(`Failed to copy asset: ${uploadResult.error}`);
      }
      assetsToInsert.push({
        prototype_id: newPrototypeId,
        name: asset.name,
        storage_url: uploadResult.publicUrl,
      });
    }

    const { error: assetsInsertError } = await supabase
      .from('prototype_assets')
      .insert(assetsToInsert);
    if (assetsInsertError) {
      log2.error(assetsInsertError, '[forkPrototype] Failed to insert assets');
      await deletePrototypeAssetsFromStorage(newPrototypeId, log2);
      await supabase
        .from('prototype_assets')
        .delete()
        .eq('prototype_id', newPrototypeId);
      await supabase
        .from('prototype_files')
        .delete()
        .eq('prototype_id', newPrototypeId);
      throw new Error(`Failed to insert assets: ${assetsInsertError.message}`);
    }

    // Copy S3 bucket existing build files with versioned deployment
    const s3CopyResult = await copyS3BucketContentsVersioned(
      this.s3Client,
      sourcePrototypeId,
      newPrototypeId,
      log2,
    );
    if (!s3CopyResult.success) {
      log2.error(s3CopyResult, '[forkPrototype] Failed to copy S3 bucket');
      throw new Error(`Failed to copy S3 bucket: ${s3CopyResult.error}`);
    }
  }

  /**
   * Helper function to create a new prototype with default files
   */
  private async createNewPrototype(
    supabase: SupabaseClient<Database>,
    newPrototypeId: string,
    log2: SystemLogger,
  ): Promise<void> {
    // Get default app files from S3 raw files
    const defaultFilesResult = await getDefaultAppFilesFromS3(
      this.s3Client,
      newPrototypeId,
      log2,
    );
    if (!defaultFilesResult.success) {
      log2.error(
        defaultFilesResult,
        '[createNewPrototype] Failed to get default files from S3',
      );
      throw new Error(
        `Failed to get default files from S3: ${defaultFilesResult.error}`,
      );
    }

    // Insert default prototype files into Supabase
    const { error: filesError } = await supabase
      .from('prototype_files')
      .insert(defaultFilesResult.files ?? []);
    if (filesError) {
      log2.error(
        filesError,
        '[createNewPrototype] Failed to insert default files',
      );
      throw new Error(`Failed to insert default files: ${filesError.message}`);
    }

    // Insert default prototype assets into Supabase
    const { error: assetsError } = await supabase
      .from('prototype_assets')
      .insert(defaultFilesResult.assets ?? []);

    if (assetsError) {
      log2.error(
        assetsError,
        '[createNewPrototype] Failed to insert default assets',
      );
      throw new Error(
        `Failed to insert default assets: ${assetsError.message}`,
      );
    }

    // Copy default app files to S3 for new prototype with versioned deployment
    const s3CopyResult = await copyDefaultAppToVersionedPrototype(
      this.s3Client,
      newPrototypeId,
      log2,
    );
    if (!s3CopyResult.success) {
      log2.error(
        s3CopyResult,
        '[createNewPrototype] Failed to copy default app to S3',
      );
      throw new Error(
        `Failed to copy default app to S3: ${s3CopyResult.error}`,
      );
    }
  }
}
