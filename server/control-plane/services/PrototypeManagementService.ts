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
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';

export class PrototypeManagementService {
  private fastifyApp: FastifyInstance;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;
  }

  public registerRoutes(app: FastifyInstance): void {
    app.post<{ Body: FetchViewingUrlRequestBody }>(
      '/prototype/fetch-viewing-url',
      this.handleFetchViewingUrl.bind(this),
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
}
