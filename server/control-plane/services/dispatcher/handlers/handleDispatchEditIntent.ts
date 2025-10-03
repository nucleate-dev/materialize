import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  DispatchPrecheckErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { CACHE_KEYS, isActiveBuildType } from '../../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../../utils/cacheInteractionUtils.js';
import { GlideClient } from '@valkey/valkey-glide';

export async function handleDispatchEditIntentImpl(
  request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
  reply: FastifyReply,
  cache: GlideClient,
  fastifyApp: FastifyInstance,
): Promise<
  APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
> {
  // 1. Extract validated body
  const { prototype_id } = request.body;
  request.log2 = request.log2.child({
    prototypeId: prototype_id,
  });

  // 2. Extract JWT from Authorization header
  const jwt = request.headers.authorization?.split(' ')[1];
  if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'No JWT token provided in Authorization header',
      },
    };
  }

  try {
    // 3. Make a call to dispatch precheck to get the precheck response
    const precheckInjectResponse = await fastifyApp.inject({
      method: 'POST',
      url: '/dispatch-precheck',
      headers: {
        'x-trace-id': request.log2.getTraceId(),
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        prototype_id,
      } as DispatchPrecheckRequestBody,
    });

    const precheckResponse: APIResponse<
      DispatchPrecheckSuccessResponse,
      DispatchPrecheckErrorResponse
    > = JSON.parse(precheckInjectResponse.payload);

    // 4. If there's an editable dev server, then update the last_touched timestamp to now in the current active build so it doesn't get cleaned
    if (
      precheckResponse.data &&
      isEditableDevServer(precheckResponse.data.status)
    ) {
      // Get current build ID and update last_touched timestamp
      const currentBuildId = await cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      if (currentBuildId) {
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

        if (existingBuild && isActiveBuildType(existingBuild)) {
          const updatedBuildData = {
            ...existingBuild,
            last_touched: Math.floor(Date.now() / 1000),
          };

          // Update the active build cache with new timestamp
          await cache.hset(
            activeBuildKey,
            activeBuildToStringRecord(updatedBuildData),
          );

          // Update builds ZSET with new timestamp
          const buildIdFromKey = activeBuildKey.replace('active_build:', '');
          await cache.customCommand([
            'ZADD',
            CACHE_KEYS.protoBuilds(prototype_id),
            updatedBuildData.last_touched.toString(),
            buildIdFromKey,
          ]);

          request.log2.consoleLogDevOnly(
            'info',
            `[handleDispatchEditIntent] Updated last_touched timestamp for build: ${currentBuildId}`,
          );
        }
      }
    }

    // 5. Return the precheck response
    reply.status(HTTP_STATUS.OK);
    return precheckResponse;
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    request.log2.error(
      error,
      '[handleDispatchEditIntent] Edit intent request failed',
    );

    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
}
