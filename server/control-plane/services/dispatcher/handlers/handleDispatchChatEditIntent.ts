import {
  APIResponse,
  StandardErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  BuildStatus,
} from '../../../types/PublicAPITypes.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { CACHE_KEYS, isActiveBuildType } from '../../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
  hgetallAsDevBuild,
} from '../../../utils/cacheInteractionUtils.js';
import { GlideClient } from '@valkey/valkey-glide';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { handleDispatchPrecheckImpl } from './handleDispatchPrecheck.js';

export async function handleDispatchChatEditIntentImpl(
  body: DispatchPrecheckRequestBody,
  jwt: string,
  cache: GlideClient,
  log2: SystemLogger,
): Promise<
  APIResponse<DispatchPrecheckSuccessResponse, StandardErrorResponse>
> {
  // 1. Extract validated body
  const { prototype_id } = body;
  log2 = log2.child({
    prototypeId: prototype_id,
  });

  // ------------------------------------------------------------------------------------------------
  // FOR DEVELOPMENT PURPOSES: if env is dev, fargate dev mode is enabled, and an ip is provided, skip
  // all auth & cache management logic and just dispatch to the provided ip directly
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.FARGATE_DEV_MODE === 'true' &&
    process.env.FARGATE_DEV_IP
  ) {
    const devKey = CACHE_KEYS.protoDev(prototype_id);
    const existingDevData = await hgetallAsDevBuild(cache, devKey);
    return {
      data: {
        status: (existingDevData?.status as BuildStatus) || null,
        viewing_url: existingDevData?.url || '',
        terminal_tunnel_hostname:
          existingDevData?.terminal_tunnel_hostname || null,
      },
      error: null,
    };
  }
  // ------------------------------------------------------------------------------------------------

  try {
    // 2. Make a call to dispatch precheck to get the precheck response
    const precheckResult = await handleDispatchPrecheckImpl(
      body,
      jwt,
      cache,
      log2,
    );
    if (precheckResult.error) {
      return precheckResult;
    }

    // 4. If there's an editable dev server, then update the status to "chatting" and the last_touched timestamp to now in the current active build so it doesn't get cleaned
    if (isEditableDevServer(precheckResult.data.status)) {
      // Get current build ID and update last_touched timestamp
      const currentBuildId = await cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      if (currentBuildId) {
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

        if (existingBuild && isActiveBuildType(existingBuild)) {
          // Update the active build cache with new status and timestamp
          const updatedBuildData = {
            ...existingBuild,
            status: 'chatting' as BuildStatus,
            last_touched: Math.floor(Date.now() / 1000),
          };
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
        }
      }
    }

    // 5. Return the precheck response
    return precheckResult;
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    log2.error(error, '[handleDispatchEditIntent] Edit intent request failed');

    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
}
