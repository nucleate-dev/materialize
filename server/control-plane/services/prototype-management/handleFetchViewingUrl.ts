import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  DispatchPrecheckErrorResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  HTTP_STATUS,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';

export default async function handleFetchViewingUrlImpl(
  request: FastifyRequest<{ Body: FetchViewingUrlRequestBody }>,
  reply: FastifyReply,
  fastifyApp: FastifyInstance,
): Promise<APIResponse<FetchViewingUrlSuccessResponse, StandardErrorResponse>> {
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
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Access denied for this prototype',
        },
      });
    }

    // Check if user is prototype owner and current_page is 'edit'
    if (authResult.canEdit && current_page === 'edit') {
      try {
        // Fetch dispatch-precheck from control plane
        const precheckResponse = await fastifyApp.inject({
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
          const precheckData: APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse> =
            precheckResponse.json();

          // Type guard to check if it's a success response
          if (
            precheckData.data &&
            precheckData.data.success &&
            precheckData.data.viewing_url
          ) {
            const isEditable = isEditableDevServer(precheckData.data.status);
            let staticViewingUrl = precheckData.data.viewing_url;
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
            return reply.status(HTTP_STATUS.OK).send({
              data: successResponse,
              error: null,
            });
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
    return reply.status(HTTP_STATUS.OK).send({
      data: successResponse,
      error: null,
    });
  } catch (error) {
    request.log2.error(error, 'Fetch viewing URL error:');
    const errorResponse: StandardErrorResponse = {
      error: 'Internal Server Error',
      message: 'Internal server error',
    };
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: errorResponse,
    });
  }
}
