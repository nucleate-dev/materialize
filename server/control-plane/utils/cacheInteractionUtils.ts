import { GlideClient } from '@valkey/valkey-glide';
import { ActiveBuild, CACHE_KEYS } from '../types/InternalTypes.js';
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

export async function hgetallAsActiveBuild(
  cache: GlideClient,
  key: string,
): Promise<ActiveBuild | null> {
  const raw = await cache.hgetall(key);

  if (!raw || raw.length === 0) return null;

  const obj = Object.fromEntries(
    raw.map(
      (e: { field: { toString(): string }; value: { toString(): string } }) => [
        e.field.toString(),
        e.value.toString(),
      ],
    ),
  ) as Record<string, string>;

  // Handle missing fields gracefully
  if (!obj.status || !obj.last_touched) {
    return null;
  }

  return {
    fargate_task_arn: obj.fargate_task_arn || '',
    fargate_private_ip: obj.fargate_private_ip || '',
    url: obj.url || '',
    status: obj.status as ActiveBuild['status'],
    last_touched: parseInt(obj.last_touched, 10),
    terminal_tunnel_id: obj.terminal_tunnel_id || '',
    terminal_tunnel_hostname: obj.terminal_tunnel_hostname || '',
    orchestration_token: obj.orchestration_token || '',
    clean_attempts: parseInt(obj.clean_attempts || '0', 10),
  };
}

export function activeBuildToStringRecord(
  build: ActiveBuild,
): Record<string, string> {
  return {
    fargate_task_arn: build.fargate_task_arn,
    fargate_private_ip: build.fargate_private_ip,
    url: build.url,
    status: build.status,
    last_touched: build.last_touched.toString(),
    terminal_tunnel_id: build.terminal_tunnel_id,
    terminal_tunnel_hostname: build.terminal_tunnel_hostname,
    orchestration_token: build.orchestration_token,
    clean_attempts: build.clean_attempts.toString(),
  };
}

export async function updateBuildTunnelInfo(
  cache: GlideClient,
  activeBuildKey: string,
  tunnelId: string,
  tunnelHostname: string,
  orchestrationToken: string,
): Promise<void> {
  await cache.hset(activeBuildKey, {
    terminal_tunnel_id: tunnelId,
    terminal_tunnel_hostname: tunnelHostname,
    orchestration_token: orchestrationToken,
  });
}

/*
THIS IS ONLY MEANT TO BE USED FOR INTERNAL FARGATE DEV MODE
*/
export async function hgetallAsDevBuild(
  cache: GlideClient,
  key: string,
): Promise<{ status: string | null; url: string; terminal_tunnel_hostname: string } | null> {
  const raw = await cache.hgetall(key);

  if (!raw || raw.length === 0) return null;

  const obj = Object.fromEntries(
    raw.map(
      (e: { field: { toString(): string }; value: { toString(): string } }) => [
        e.field.toString(),
        e.value.toString(),
      ],
    ),
  ) as Record<string, string>;

  return {
    status: obj.status || null,
    url: obj.url || '',
    terminal_tunnel_hostname: obj.terminal_tunnel_hostname || '',
  };
}
