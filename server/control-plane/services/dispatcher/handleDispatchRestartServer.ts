import { FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  HTTP_STATUS,
  RestartDevServerRequestBody,
  RestartDevServerSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { GlideClient } from '@valkey/valkey-glide';
import { CACHE_KEYS, isActiveBuildType } from '../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import axios from 'axios';

export async function handleRestartDevServerImpl(
  request: FastifyRequest<{ Body: RestartDevServerRequestBody }>,
  reply: FastifyReply,
  cache: GlideClient,
): Promise<
  APIResponse<RestartDevServerSuccessResponse, StandardErrorResponse>
> {
  const { prototype_id } = request.body;

  // 1. Extract JWT from Authorization header
  const jwt = request.headers.authorization?.split(' ')[1];
  if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'No JWT token provided in Authorization header',
      },
    });
  }

  // 2. Authentication check
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    request.log2,
  );
  if (!authResult || !authResult.canEdit) {
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    });
  }

  request.log2 = request.log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    // 3. Get current build ID
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    if (!currentBuildId) {
      return reply.status(HTTP_STATUS.NOT_FOUND).send({
        data: null,
        error: {
          error: 'Not Found',
          message: 'No active dev server found for this prototype',
        },
      });
    }

    // 4. Get the active build data
    const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
    const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

    if (!existingBuild || !isActiveBuildType(existingBuild)) {
      return reply.status(HTTP_STATUS.NOT_FOUND).send({
        data: null,
        error: {
          error: 'Not Found',
          message: 'Invalid or missing build data',
        },
      });
    }

    // 5. Check if dev server is in a restartable state
    if (!isEditableDevServer(existingBuild.status)) {
      return reply.status(HTTP_STATUS.CONFLICT).send({
        data: null,
        error: {
          error: 'Conflict',
          message: `Cannot restart dev server in ${existingBuild.status} state`,
        },
      });
    }

    // 6. Call restart endpoint on the fargate instance
    const restartResponse = await callFargateRestart(
      existingBuild.fargate_private_ip,
      request.log2,
    );

    if (restartResponse.success) {
      // 7. Update last_touched timestamp
      const updatedBuildData = {
        ...existingBuild,
        last_touched: Math.floor(Date.now() / 1000),
      };

      await cache.hset(
        activeBuildKey,
        activeBuildToStringRecord(updatedBuildData),
      );

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          message: 'Dev server restarted successfully',
        } as RestartDevServerSuccessResponse,
        error: null,
      });
    } else {
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: 'Failed to restart dev server',
        },
      });
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    request.log2.error(error, 'Failed to restart dev server');

    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    });
  }
}

async function callFargateRestart(
  fargatePrivateIp: string,
  log2: SystemLogger,
): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await axios.post(
      `http://${fargatePrivateIp}:3002/dev-server/restart`,
      {},
      {
        timeout: 90000, // 90 second timeout for restart
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': log2.getTraceId(),
        },
      },
    );

    log2.info('Fargate restart response:', { response: response.data });
    return { success: true };
  } catch (error) {
    log2.error(error, 'Error calling fargate restart endpoint');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
