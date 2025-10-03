import {
  APIResponse,
  RestartDevServerRequestBody,
  RestartDevServerSuccessResponse,
  StandardErrorResponse,
} from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { GlideClient } from '@valkey/valkey-glide';
import { CACHE_KEYS, isActiveBuildType } from '../../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import axios from 'axios';

export async function handleRestartDevServerImpl(
  body: RestartDevServerRequestBody,
  jwt: string,
  cache: GlideClient,
  log2: SystemLogger,
): Promise<
  APIResponse<RestartDevServerSuccessResponse, StandardErrorResponse>
> {
  const { prototype_id } = body;

  // 1. Authentication check
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    log2,
  );
  if (!authResult || !authResult.canEdit) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }

  log2 = log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    // 3. Get current build ID
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    if (!currentBuildId) {
      return {
        data: null,
        error: {
          error: 'Not Found',
          message: 'No active dev server found for this prototype',
        },
      };
    }

    // 4. Get the active build data
    const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
    const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

    if (!existingBuild || !isActiveBuildType(existingBuild)) {
      return {
        data: null,
        error: {
          error: 'Not Found',
          message: 'Invalid or missing build data',
        },
      };
    }

    // 5. Check if dev server is in a restartable state
    if (!isEditableDevServer(existingBuild.status)) {
      return {
        data: null,
        error: {
          error: 'Conflict',
          message: `Cannot restart dev server in ${existingBuild.status} state`,
        },
      };
    }

    // 6. Call restart endpoint on the fargate instance
    const restartResponse = await callFargateRestart(
      existingBuild.fargate_private_ip,
      log2,
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

      return {
        data: {
          message: 'Dev server restarted successfully',
        } as RestartDevServerSuccessResponse,
        error: null,
      };
    } else {
      return {
        data: null,
        error: {
          error: 'Internal Server Error',
          message: 'Failed to restart dev server',
        },
      };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    log2.error(error, 'Failed to restart dev server');

    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
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
