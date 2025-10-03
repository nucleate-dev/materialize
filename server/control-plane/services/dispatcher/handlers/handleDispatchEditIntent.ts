import {
  APIResponse,
  StandardErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
} from '../../../types/PublicAPITypes.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { CACHE_KEYS, isActiveBuildType } from '../../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../../utils/cacheInteractionUtils.js';
import { GlideClient } from '@valkey/valkey-glide';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { handleDispatchPrecheckImpl } from './handleDispatchPrecheck.js';

export async function handleDispatchEditIntentImpl(
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

  try {
    // 2. Make a call to dispatch precheck to get the precheck response
    const precheckResult = await handleDispatchPrecheckImpl(
      body,
      jwt,
      cache,
      log2,
    );

    // 4. If there's an editable dev server, then update the last_touched timestamp to now in the current active build so it doesn't get cleaned
    if (
      precheckResult.data &&
      isEditableDevServer(precheckResult.data.status)
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

          log2.consoleLogDevOnly(
            'info',
            `[handleDispatchEditIntent] Updated last_touched timestamp for build: ${currentBuildId}`,
          );
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
