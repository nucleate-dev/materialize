import { ActiveBuild, IdleBuild } from '../types/InternalTypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import { BuildStatus } from '../types/PublicAPITypes.js';
import { getCacheClient } from './cacheSupabaseClient.js';

// ============================================================================
// ACTIVE BUILD OPERATIONS
// ============================================================================

/**
 * Get the current active build for a prototype.
 * Replaces: cache.get(CACHE_KEYS.protoCurrentBuild(prototypeId)) + hgetallAsActiveBuild(cache, key)
 */
export async function getCurrentBuildForPrototype(
  prototypeId: string,
): Promise<{ build: ActiveBuild; buildId: string } | null> {
  // Using service role client because cache tables are only accessible via service role
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('*')
    .eq('prototype_id', prototypeId)
    .eq('is_current', true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    buildId: data.build_id,
    build: rowToActiveBuild(data),
  };
}

/**
 * Get the current build ID for a prototype (just the ID, not the full build).
 * Replaces: cache.get(CACHE_KEYS.protoCurrentBuild(prototypeId))
 */
export async function getCurrentBuildId(
  prototypeId: string,
): Promise<string | null> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('build_id')
    .eq('prototype_id', prototypeId)
    .eq('is_current', true)
    .maybeSingle();

  if (error || !data) return null;
  return data.build_id;
}

/**
 * Get an active build by its build ID.
 * Replaces: hgetallAsActiveBuild(cache, CACHE_KEYS.activeBuild(buildId))
 */
export async function getActiveBuild(
  buildId: string,
): Promise<ActiveBuild | null> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('*')
    .eq('build_id', buildId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToActiveBuild(data);
}

/**
 * Update specific fields on an active build.
 * Replaces: cache.hset(activeBuildKey, activeBuildToStringRecord(updatedBuild))
 */
export async function updateBuildFields(
  buildId: string,
  fields: Partial<ActiveBuild>,
): Promise<void> {
  const supabase = getCacheClient();
  const { error } = await supabase
    .from('cache_active_builds')
    .update(fields)
    .eq('build_id', buildId);

  if (error) throw new Error(`Failed to update build ${buildId}: ${error.message}`);
}

/**
 * Update build status and optionally last_touched.
 * Replaces: cache.hset(activeBuildKey, { status, last_touched })
 */
export async function updateBuildStatus(
  buildId: string,
  status: BuildStatus,
  lastTouched?: number,
): Promise<void> {
  const fields: Partial<ActiveBuild> = { status };
  if (lastTouched !== undefined) {
    fields.last_touched = lastTouched;
  }
  await updateBuildFields(buildId, fields);
}

/**
 * Create a new build and set it as the current build for a prototype.
 * Replaces: setNewBuildCacheData (cache.hset + cache.set + ZADD)
 * Uses the cache_set_current_build RPC for atomicity.
 */
export async function createNewBuild(
  buildId: string,
  prototypeId: string,
  data: ActiveBuild,
): Promise<void> {
  const supabase = getCacheClient();

  // Use the RPC to atomically unset old current and insert new build
  const { error: rpcError } = await supabase.rpc('cache_set_current_build', {
    p_build_id: buildId,
    p_prototype_id: prototypeId,
    p_url: data.url,
    p_status: data.status,
    p_last_touched: data.last_touched,
  });

  if (rpcError) throw new Error(`Failed to create build ${buildId}: ${rpcError.message}`);
}

/**
 * Remove a build from the cache.
 * Replaces: removeBuildDataFromCache (cache.del + ZREM + conditional current pointer delete)
 * Uses the cache_remove_build RPC for atomicity.
 */
export async function removeBuildDataFromCache(
  log2: SystemLogger,
  prototypeId: string,
  buildId: string,
): Promise<boolean> {
  try {
    log2.consoleLogDevOnly('info', 'Removing build data from cache', {
      buildId,
      prototypeId,
    });

    const supabase = getCacheClient();
    const { data, error } = await supabase.rpc('cache_remove_build', {
      p_build_id: buildId,
      p_prototype_id: prototypeId,
    });

    if (error) {
      log2.error(error, 'Failed to remove build data from cache', {
        prototypeId,
        buildId,
      });
      return false;
    }

    return data ?? false;
  } catch (error) {
    log2.error(error, 'Failed to remove build data from cache', {
      prototypeId,
      buildId,
    });
    return false;
  }
}

/**
 * Update tunnel info on an active build.
 * Replaces: updateBuildTunnelInfo (cache.hset with tunnel fields)
 */
export async function updateBuildTunnelInfo(
  buildId: string,
  tunnelId: string,
  tunnelHostname: string,
  orchestrationToken: string,
): Promise<void> {
  await updateBuildFields(buildId, {
    terminal_tunnel_id: tunnelId,
    terminal_tunnel_hostname: tunnelHostname,
    orchestration_token: orchestrationToken,
  });
}

/**
 * Get all active builds (for cleanup service scanning and internal tools).
 * Replaces: SCAN active_build:* + hgetallAsActiveBuild for each
 */
export async function getAllActiveBuilds(): Promise<
  Array<{ build: ActiveBuild; buildId: string; buildKey: string }>
> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('*');

  if (error || !data) return [];

  return data.map((row) => ({
    build: rowToActiveBuild(row),
    buildId: row.build_id,
    buildKey: `active_build:${row.build_id}`, // kept for compatibility with cleanup types
  }));
}

/**
 * Get all active builds for a specific prototype.
 * Replaces: scanning active_build:* and filtering by prototype ID
 */
export async function getActiveBuildsForPrototype(
  prototypeId: string,
): Promise<
  Array<{ build: ActiveBuild; buildId: string; isCurrent: boolean }>
> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('*')
    .eq('prototype_id', prototypeId)
    .order('last_touched', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    build: rowToActiveBuild(row),
    buildId: row.build_id,
    isCurrent: row.is_current,
  }));
}

/**
 * Get build history for a prototype (ordered by last_touched descending).
 * Replaces: ZRANGE proto:{prototypeId}:builds 0 -1 WITHSCORES
 */
export async function getBuildHistory(
  prototypeId: string,
): Promise<Array<{ buildId: string; timestamp: number }>> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_active_builds')
    .select('build_id, last_touched')
    .eq('prototype_id', prototypeId)
    .order('last_touched', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    buildId: row.build_id,
    timestamp: row.last_touched,
  }));
}

// ============================================================================
// IDLE CONTAINER OPERATIONS
// ============================================================================

/**
 * Get the count of idle containers.
 * Replaces: cache.llen(CACHE_KEYS.idleBuildsListKey)
 */
export async function getIdleContainerCount(): Promise<number> {
  const supabase = getCacheClient();
  const { data, error } = await supabase.rpc('cache_get_idle_container_count');
  if (error) return 0;
  return data ?? 0;
}

/**
 * Pop the oldest idle container (FIFO allocation).
 * Replaces: cache.rpop(CACHE_KEYS.idleBuildsListKey) + cache.del([idleKey])
 * Returns the full idle container data or null if none available.
 */
export async function popOldestIdleContainer(): Promise<IdleBuild | null> {
  const supabase = getCacheClient();
  const { data, error } = await supabase.rpc('cache_pop_oldest_idle_container');
  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    fargate_task_arn: row.fargate_task_arn,
    fargate_private_ip: row.fargate_private_ip,
    status: row.status as IdleBuild['status'],
  };
}

/**
 * Pop the newest idle container (for capacity trimming).
 * Replaces: cache.lpop(CACHE_KEYS.idleBuildsListKey)
 */
export async function popNewestIdleContainer(): Promise<IdleBuild | null> {
  const supabase = getCacheClient();
  const { data, error } = await supabase.rpc('cache_pop_newest_idle_container');
  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    fargate_task_arn: row.fargate_task_arn,
    fargate_private_ip: row.fargate_private_ip,
    status: row.status as IdleBuild['status'],
  };
}

/**
 * Insert a new idle container with status 'creating'.
 * Replaces: cache.hset(idleKey, {...}) + cache.lpush(CACHE_KEYS.idleBuildsListKey, [taskArn])
 */
export async function insertIdleContainer(taskArn: string): Promise<void> {
  const supabase = getCacheClient();
  const { error } = await supabase.from('cache_idle_containers').insert({
    fargate_task_arn: taskArn,
    fargate_private_ip: '',
    status: 'creating',
  });
  if (error) throw new Error(`Failed to insert idle container ${taskArn}: ${error.message}`);
}

/**
 * Update an idle container to 'ready' status with its private IP.
 * Replaces: cache.hset(idleKey, { status: 'ready', fargate_private_ip, fargate_task_arn })
 */
export async function updateIdleContainerReady(
  taskArn: string,
  privateIp: string,
): Promise<void> {
  const supabase = getCacheClient();
  const { error } = await supabase
    .from('cache_idle_containers')
    .update({
      status: 'ready',
      fargate_private_ip: privateIp,
    })
    .eq('fargate_task_arn', taskArn);

  if (error) throw new Error(`Failed to update idle container ${taskArn}: ${error.message}`);
}

/**
 * Delete an idle container by task ARN.
 * Replaces: cache.del([idleKey])
 */
export async function deleteIdleContainer(taskArn: string): Promise<void> {
  const supabase = getCacheClient();
  await supabase
    .from('cache_idle_containers')
    .delete()
    .eq('fargate_task_arn', taskArn);
}

/**
 * Check if an idle container exists.
 * Replaces: cache.exists([idleKey])
 */
export async function idleContainerExists(taskArn: string): Promise<boolean> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_idle_containers')
    .select('fargate_task_arn')
    .eq('fargate_task_arn', taskArn)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

// ============================================================================
// DEV BUILD OPERATIONS (development/sandbox simulator mode only)
// ============================================================================

/**
 * Get a dev build by prototype ID.
 * Replaces: hgetallAsDevBuild(cache, CACHE_KEYS.protoDev(prototypeId))
 */
export async function getDevBuild(
  prototypeId: string,
): Promise<{
  status: BuildStatus | null;
  url: string;
  terminal_tunnel_hostname: string;
  orchestration_token: string;
} | null> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('cache_dev_builds')
    .select('*')
    .eq('prototype_id', prototypeId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    status: (data.status as BuildStatus) ?? null,
    url: data.url,
    terminal_tunnel_hostname: data.terminal_tunnel_hostname,
    orchestration_token: data.orchestration_token,
  };
}

/**
 * Upsert a dev build.
 * Replaces: cache.hset(devKey, { status, url, terminal_tunnel_hostname, orchestration_token })
 */
export async function upsertDevBuild(
  prototypeId: string,
  fields: {
    status?: BuildStatus;
    url?: string;
    terminal_tunnel_hostname?: string;
    orchestration_token?: string;
  },
): Promise<void> {
  const supabase = getCacheClient();
  const { error } = await supabase
    .from('cache_dev_builds')
    .upsert(
      {
        prototype_id: prototypeId,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'prototype_id' },
    );

  if (error) throw new Error(`Failed to upsert dev build for ${prototypeId}: ${error.message}`);
}

/**
 * Delete a dev build.
 * Replaces: cache.del([CACHE_KEYS.protoDev(prototypeId)])
 */
export async function deleteDevBuild(prototypeId: string): Promise<boolean> {
  const supabase = getCacheClient();
  const { error, count } = await supabase
    .from('cache_dev_builds')
    .delete({ count: 'exact' })
    .eq('prototype_id', prototypeId);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Delete all dev builds.
 * Replaces: scanning development:* + deleting each
 */
export async function deleteAllDevBuilds(): Promise<number> {
  const supabase = getCacheClient();
  const { error, count } = await supabase
    .from('cache_dev_builds')
    .delete({ count: 'exact' })
    .neq('prototype_id', ''); // delete all rows

  if (error) return 0;
  return count ?? 0;
}

// ============================================================================
// CACHE-WIDE OPERATIONS (for internal tools)
// ============================================================================

/**
 * Clear all cache data.
 * Replaces: cache.flushall()
 */
export async function clearAllCacheData(): Promise<void> {
  const supabase = getCacheClient();

  // Delete from all three tables
  await Promise.all([
    supabase.from('cache_active_builds').delete().neq('build_id', ''),
    supabase.from('cache_idle_containers').delete().neq('fargate_task_arn', ''),
    supabase.from('cache_dev_builds').delete().neq('prototype_id', ''),
  ]);
}

/**
 * Get cache statistics.
 * Replaces: scanning all keys and categorizing
 */
export async function getCacheStats(): Promise<{
  activeBuilds: number;
  idleContainers: number;
  devBuilds: number;
}> {
  const supabase = getCacheClient();

  const [activeBuildResult, idleContainerResult, devBuildResult] =
    await Promise.all([
      supabase
        .from('cache_active_builds')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('cache_idle_containers')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('cache_dev_builds')
        .select('*', { count: 'exact', head: true }),
    ]);

  return {
    activeBuilds: activeBuildResult.count ?? 0,
    idleContainers: idleContainerResult.count ?? 0,
    devBuilds: devBuildResult.count ?? 0,
  };
}

// ============================================================================
// INFRA CONFIG OPERATIONS
// ============================================================================

/**
 * Get an infrastructure config value by key, with a fallback default.
 * Reads from the infra_config table (service-role-only).
 */
export async function getInfraConfig(key: string, defaultValue: string): Promise<string> {
  const supabase = getCacheClient();
  const { data, error } = await supabase
    .from('infra_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return defaultValue;
  return data.value;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a Supabase row to an ActiveBuild object.
 */
function rowToActiveBuild(
  row: {
    fargate_task_arn: string;
    fargate_private_ip: string;
    url: string;
    status: string;
    last_touched: number;
    terminal_tunnel_id: string;
    terminal_tunnel_hostname: string;
    orchestration_token: string;
    clean_attempts: number;
  },
): ActiveBuild {
  return {
    fargate_task_arn: row.fargate_task_arn,
    fargate_private_ip: row.fargate_private_ip,
    url: row.url,
    status: row.status as BuildStatus,
    last_touched: row.last_touched,
    terminal_tunnel_id: row.terminal_tunnel_id,
    terminal_tunnel_hostname: row.terminal_tunnel_hostname,
    orchestration_token: row.orchestration_token,
    clean_attempts: row.clean_attempts,
  };
}
