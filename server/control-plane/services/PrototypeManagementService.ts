import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  CreatePrototypeSuccessResponse,
  CreatePrototypeErrorResponse,
} from '../types/PublicAPITypes.js';
import type { 
  Database,
} from '../types/supabase.js';
import type {
  PrototypeInsert,
  PrototypeFileInsert,
} from '../types/InternalTypes.js';
import {
  authenticatePrototypeUser,
  checkPrototypeLimit,
  getPrototypeFiles,
} from '../utils/prototypeAuth.js';
import {
  copyAssetInSupabaseStorage,
  copyS3BucketContents,
  getDefaultAppFilesFromS3,
  copyDefaultAppToPrototype,
  getPrototypeViewingUrl,
  cleanupPrototypeS3Objects,
  deletePrototypeAssetsFromStorage,
} from '../utils/s3Operations.js';

export class PrototypeManagementService {
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

    if (!this.supabaseUrl || !this.supabaseAnonKey || !this.supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables for PrototypeManagementService');
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    app.post<{ Body: FetchViewingUrlRequestBody }>(
      '/prototype/fetch-viewing-url',
      this.handleFetchViewingUrl.bind(this),
    );
    
    app.post<{ Body: CreatePrototypeRequestBody }>(
      '/prototype/create',
      this.handleCreatePrototype.bind(this),
    );
  }

  private async handleFetchViewingUrl(
    request: FastifyRequest<{ Body: FetchViewingUrlRequestBody }>,
    reply: FastifyReply,
  ): Promise<FetchViewingUrlResponse> {
    console.log('Fetch viewing URL request received');

    try {
      const { prototype_id, current_page } = request.body;

      if (!prototype_id) {
        const errorResponse: StandardErrorResponse = {
          error: 'Bad Request',
          message: 'prototype_id is required',
        };
        reply.status(HTTP_STATUS.BAD_REQUEST);
        return errorResponse;
      }

      // Get JWT token if provided (optional for this endpoint)
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : undefined;

      // Create Supabase client with optional JWT auth
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
          global: {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        },
      );

      // Get user ID if token is provided
      let userId: string | undefined;
      if (token) {
        try {
          const { data: user } = await supabase.auth.getUser();
          userId = user.user?.id;
        } catch (error) {
          console.warn('Failed to get user from token:', error);
          // Continue without user ID - this endpoint allows anonymous access
        }
      }

      // Attempt to access prototype from DB to check viewing privileges
      const { data: prototypeData, error: prototypeError } = await supabase
        .from('prototypes')
        .select('id, owner_id')
        .eq('id', prototype_id)
        .single();

      if (prototypeError || !prototypeData) {
        console.log('Prototype not found or access denied:', prototypeError);
        const errorResponse: StandardErrorResponse = {
          error: 'Not Found',
          message: 'Prototype not found or access denied',
        };
        reply.status(HTTP_STATUS.NOT_FOUND);
        return errorResponse;
      }

      // Check if user is prototype owner and current_page is 'edit'
      if (
        userId &&
        userId === prototypeData.owner_id &&
        current_page === 'edit'
      ) {
        try {
          // Fetch dispatch-precheck from control plane
          console.log(
            'Fetching dispatch-precheck to get active tunnel URL if exists',
          );

          const precheckResponse = await this.fastifyApp.inject({
            method: 'POST',
            url: '/dispatch-precheck',
            headers: {
              'Content-Type': 'application/json',
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
              console.log('Returning active instance URL from precheck');
              const successResponse: FetchViewingUrlSuccessResponse = {
                viewing_url: precheckData.viewing_url,
                source: 'active_instance',
              };
              reply.status(HTTP_STATUS.OK);
              return successResponse;
            }
          }
        } catch (precheckError) {
          console.warn(
            'Failed to fetch dispatch precheck, falling back to static build:',
            precheckError,
          );
          // Continue to static build fallback
        }
      }

      // Return static build URL
      console.log('Returning static build URL');
      const staticViewingUrl = `https://${prototype_id}.render.materializeui.com/`;

      const successResponse: FetchViewingUrlSuccessResponse = {
        viewing_url: staticViewingUrl,
        source: 'static_build',
      };

      reply.status(HTTP_STATUS.OK);
      return successResponse;
    } catch (error) {
      console.error('Fetch viewing URL error:', error);

      const errorResponse: StandardErrorResponse = {
        error: 'Internal Server Error',
        message: 'Internal server error',
      };

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return errorResponse;
    }
  }

  private async handleCreatePrototype(
    request: FastifyRequest<{ Body: CreatePrototypeRequestBody }>,
    reply: FastifyReply,
  ): Promise<CreatePrototypeResponse> {
    try {
      // 1. JWT Token validation and user authentication
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        console.error('No JWT token provided');
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'No authentication token provided',
        };
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return errorResponse;
      }

      // Create Supabase client with service role for admin operations
      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      // Authenticate user and get subscription info
      const authResult = await authenticatePrototypeUser(supabase, token);
      if (!authResult.success) {
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'UNAUTHORIZED',
          message: authResult.message || 'Authentication failed',
        };
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return errorResponse;
      }

      const { userId, subscriptionPlan } = authResult;

      // 2. Check prototype limits for free users (5 max)
      const limitCheck = await checkPrototypeLimit(supabase, userId, subscriptionPlan);
      if (!limitCheck.canCreate) {
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'PROTOTYPE_LIMIT_REACHED',
          message: limitCheck.message || 'Prototype limit reached',
        };
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return errorResponse;
      }

      // 3. Parse request body
      const {
        name,
        description,
        project_id,
        prototype_id: forkPrototypeId, // If provided, this is a fork
        visibility,
      } = request.body;

      if (!name) {
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Prototype name is required',
        };
        reply.status(HTTP_STATUS.BAD_REQUEST);
        return errorResponse;
      }

      if (visibility === 'SELF' && subscriptionPlan !== 'pro') {
        const errorResponse: CreatePrototypeErrorResponse = {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Self-visibility is only available for Pro users',
        };
        reply.status(HTTP_STATUS.BAD_REQUEST);
        return errorResponse;
      }

      // 4. Create prototype in database
      const prototypeData: PrototypeInsert = {
        name,
        description,
        owner_id: userId,
        project_id,
        visibility: visibility || (subscriptionPlan === 'pro' ? 'SELF' : 'PUBLIC'),
      };

      const { data: newPrototype, error: prototypeError } = await supabase
        .from('prototypes')
        .insert(prototypeData)
        .select()
        .single();

      if (prototypeError) {
        console.error('Error creating prototype:', prototypeError);
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
          // FORK: Copy existing prototype files and S3 bucket
          console.log(`Forking prototype ${forkPrototypeId} to ${newPrototypeId}`);

          // Get files from source prototype
          const filesResult = await getPrototypeFiles(supabase, forkPrototypeId);
          if (!filesResult.success) {
            throw new Error(filesResult.message || 'Failed to get prototype files');
          }

          // Copy files to new prototype (with new prototype_id)
          const filesToInsert: PrototypeFileInsert[] = [];

          console.log(`📁 Processing ${filesResult.files!.length} files for new prototype`);
          
          for (const file of filesResult.files!) {
            if (file.file_type === 'asset') {
              console.log(`🔄 Copying asset: ${file.name} from ${file.storage_path}`);

              // Copy asset in Supabase Storage
              const copyResult = await copyAssetInSupabaseStorage(
                forkPrototypeId,
                newPrototypeId,
                file.name,
              );

              if (!copyResult.success) {
                console.error(`❌ Failed to copy asset ${file.name}:`, copyResult.error);
                throw new Error(`Failed to copy asset ${file.name}: ${copyResult.error}`);
              }

              console.log(`✅ Asset copied: ${file.name} → ${copyResult.publicUrl}`);

              filesToInsert.push({
                prototype_id: newPrototypeId,
                name: file.name,
                contents: '', // Empty string for asset files since contents is required
                file_type: 'asset',
                storage_path: copyResult.publicUrl!,
              });
            } else {
              // Text file - just copy contents
              console.log(`📝 Copying text file: ${file.name} (${file.contents?.length || 0} chars)`);
              filesToInsert.push({
                prototype_id: newPrototypeId,
                name: file.name,
                contents: file.contents,
                file_type: file.file_type,
                storage_path: file.storage_path,
              });
            }
          }

          console.log(`💾 Files to insert: ${filesToInsert.length} total`);

          const { error: filesError } = await supabase
            .from('prototype_files')
            .insert(filesToInsert);

          if (filesError) {
            console.error('❌ Error inserting files:', filesError);
            throw new Error(`Failed to copy prototype files: ${filesError.message}`);
          }

          console.log(`✅ Successfully inserted ${filesToInsert.length} files to database`);

          // Copy S3 bucket contents
          const sourcePrefix = `prototypes/${forkPrototypeId}`;
          const destinationPrefix = `prototypes/${newPrototypeId}`;

          const s3CopyResult = await copyS3BucketContents(sourcePrefix, destinationPrefix);
          if (!s3CopyResult.success) {
            throw new Error(`Failed to copy S3 bucket: ${s3CopyResult.error}`);
          }

          console.log(`Successfully forked prototype: ${s3CopyResult.copiedObjects} files copied`);
        } else {
          // NEW CREATION: Use default app files from S3 and copy to both Supabase and S3
          console.log(`Creating new prototype ${newPrototypeId} with default files from S3`);

          // Get default app files from S3 raw files
          const defaultFilesResult = await getDefaultAppFilesFromS3(newPrototypeId);
          if (!defaultFilesResult.success) {
            throw new Error(`Failed to get default files from S3: ${defaultFilesResult.error}`);
          }

          // Convert to PrototypeFileInsert format
          const filesToInsert: PrototypeFileInsert[] = defaultFilesResult.files!.map(file => ({
            prototype_id: file.prototype_id,
            name: file.name,
            contents: file.contents,
            file_type: file.file_type,
            storage_path: file.storage_path,
          }));

          // Insert default prototype files into Supabase
          const { error: filesError } = await supabase
            .from('prototype_files')
            .insert(filesToInsert);

          if (filesError) {
            throw new Error(`Failed to insert default files: ${filesError.message}`);
          }

          // Copy default app files to S3 for new prototype (for hosting)
          const s3CopyResult = await copyDefaultAppToPrototype(newPrototypeId);
          if (!s3CopyResult.success) {
            throw new Error(`Failed to copy default app to S3: ${s3CopyResult.error}`);
          }

          console.log(
            `Successfully created new prototype: ${defaultFilesResult.files!.length} files in DB, ${s3CopyResult.copiedObjects} files copied to S3`,
          );
        }

        // 6. Get viewing URL and return success
        const viewingUrl = getPrototypeViewingUrl(newPrototypeId);

        const successResponse: CreatePrototypeSuccessResponse = {
          success: true,
          data: {
            prototype_id: newPrototypeId,
            viewing_url: viewingUrl,
          },
        };

        reply.status(HTTP_STATUS.OK);
        return successResponse;
      } catch (error) {
        // If anything fails after prototype creation, clean up
        console.error('Error during prototype setup:', error);

        // Clean up S3 objects
        await cleanupPrototypeS3Objects(newPrototypeId);

        // Clean up Supabase Storage assets
        await deletePrototypeAssetsFromStorage(newPrototypeId);

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
      console.error('Unexpected error in create-prototype:', error);
      const errorResponse: CreatePrototypeErrorResponse = {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'An unexpected error occurred',
      };

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return errorResponse;
    }
  }
}
