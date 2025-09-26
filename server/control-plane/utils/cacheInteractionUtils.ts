import { GlideClient } from '@valkey/valkey-glide';
import { CACHE_KEYS } from '../types/InternalTypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

// returns true if successful, false if not
export async function removeBuildDataFromCache(
  cache: GlideClient,
  log2: SystemLogger,
  prototypeId: string,
  buildId: string,
): Promise<boolean> {
  try {
    log2.info('Removing build data from cache', {
      buildKey: CACHE_KEYS.activeBuild(buildId),
      buildsZsetRemovalKey: CACHE_KEYS.protoBuilds(prototypeId),
      currentBuildKey: CACHE_KEYS.protoCurrentBuild(prototypeId),
    });
    await cache.del([CACHE_KEYS.activeBuild(buildId)]);
    // Remove from builds ZSET
    await cache.customCommand([
      'ZREM',
      CACHE_KEYS.protoBuilds(prototypeId),
      buildId,
    ]);
    // If this was the current build, remove the current pointer
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototypeId),
    );
    if (currentBuildId === buildId) {
      await cache.del([CACHE_KEYS.protoCurrentBuild(prototypeId)]);
    }
    return true;
  } catch (error) {
    log2.error(error, 'Failed to remove build data from cache', {
      buildKey: CACHE_KEYS.activeBuild(buildId),
      prototypeId,
      buildId,
    });
    return false;
  }
}
