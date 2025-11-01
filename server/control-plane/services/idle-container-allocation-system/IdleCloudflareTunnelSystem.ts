import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import {
  createCloudflareTunnelForContainer,
  deleteCloudflareTunnel,
} from '../../utils/cloudflareTunnelManagementUtils.js';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '../../types/supabase.js';

const MAX_IDLE_TUNNELS: number = 3;

export type CloudflareTunnel =
  Database['public']['Tables']['cloudflare_tunnels']['Row'];

export class IdleCloudflareTunnelSystem {
  private readonly log2: SystemLogger;
  private maintenanceTimer?: NodeJS.Timeout;
  private supabase: SupabaseClient<Database>;

  constructor(opts: { log2: SystemLogger }) {
    this.log2 = opts.log2.child({
      route: 'IdleContainerAllocationSystem',
    });
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.init();
  }

  /** Initialize idle pool and start maintenance loop */
  public async init(): Promise<void> {
    this.maintenanceTimer = setInterval(
      () =>
        this.ensureIdleTunnelCapacity().catch((e) =>
          this.log2.error(e, 'Idle maintenance failed'),
        ),
      10 * 60 * 1000, // every 10 minutes
    );
    await this.ensureIdleTunnelCapacity();
  }

  private async ensureIdleTunnelCapacity(): Promise<void> {
    const { count } = await this.supabase
      .from('cloudflare_tunnels')
      .select('*', { count: 'exact', head: true })
      .in('status', ['idle', 'creating']);
    const currentIdle = count || 0;
    const toCreate = MAX_IDLE_TUNNELS - currentIdle;
    if (toCreate === 0) return;
    else if (toCreate > 0) {
      this.log2.info(
        `Refreshing idle tunnels and hostnames: Creating ${toCreate} idle tunnels to reach max ${MAX_IDLE_TUNNELS}`,
      );
      await Promise.all(
        Array.from({ length: toCreate }, () =>
          this.launchIdleTunnelAndHostname(),
        ),
      );
    } else {
      // Too many idle builds, clean them up
      const toRemove = Math.abs(toCreate);
      this.log2.warn(
        `[IdleAlloc] Found ${currentIdle} idle builds, cleaning up ${toRemove} to reach max ${MAX_IDLE_TUNNELS}`,
      );

      // 1. Load #toRemove idle tunnels and hostnames to remove from supabase
      const { data: tunnelsToRemove, error: fetchError } = await this.supabase
        .from('cloudflare_tunnels')
        .select('*')
        .in('status', ['idle', 'creating'])
        .order('created_at', { ascending: false })
        .limit(toRemove);

      if (fetchError) {
        this.log2.error(fetchError, 'Failed to fetch idle tunnels for cleanup');
        return;
      }

      if (!tunnelsToRemove || tunnelsToRemove.length === 0) {
        this.log2.warn('No idle tunnels found to clean up');
        return;
      }

      // 2. Concurrently delete the tunnels and hostnames from cloudflare && remove from supabase idle pool
      await Promise.all(
        tunnelsToRemove.map(async (tunnel) => {
          try {
            // Delete from Cloudflare if tunnel_id exists
            if (tunnel.tunnel_id) {
              await deleteCloudflareTunnel(
                tunnel.tunnel_id,
                this.log2,
                tunnel.hostname || undefined,
                this.supabase,
              );
            }
          } catch (error) {
            this.log2.error(error, `Failed to cleanup tunnel ${tunnel.id}`);
          }
        }),
      );

      return;
    }
  }

  /** Launch one idle tunnel and hostname */
  private async launchIdleTunnelAndHostname(): Promise<void> {
    // 1. Immediately add a placeholder entry in supabase idle pool with status 'creating'
    this.log2.consoleLogDevOnly(
      'info',
      '[launchIdleTunnelAndHostname] Creating placeholder entry for idle tunnel',
    );
    const { data: placeholderEntry, error: insertError } = await this.supabase
      .from('cloudflare_tunnels')
      .insert({ status: 'creating' })
      .select('*')
      .single();

    if (insertError) {
      this.log2.error(
        insertError,
        'Failed to create placeholder entry for idle tunnel',
      );
      throw insertError || new Error('Failed to create placeholder entry');
    }

    try {
      this.log2.consoleLogDevOnly(
        'info',
        '[launchIdleTunnelAndHostname]Creating new tunnel and hostname in cloudflare',
      );
      // 2. Create a new tunnel and hostname in cloudflare using the cloudflareTunnelManagementUtils.ts
      const { tunnelId, token, hostname, cnameTarget } =
        await createCloudflareTunnelForContainer(uuidv4(), this.log2);

      // 3. Update all the tunnel information in the supabase idle pool (tunnel_id, hostname, token, DNS, etc.) and set status to 'idle'
      this.log2.consoleLogDevOnly(
        'info',
        '[launchIdleTunnelAndHostname] supabase idle pool with tunnel information',
      );
      const { error: updateError } = await this.supabase
        .from('cloudflare_tunnels')
        .update({
          tunnel_id: tunnelId,
          hostname: hostname,
          token: token,
          cname_target: cnameTarget,
          status: 'idle',
        })
        .eq('id', placeholderEntry.id);

      if (updateError) {
        this.log2.error(
          updateError,
          'Failed to update idle tunnel entry with tunnel information',
        );
        await deleteCloudflareTunnel(
          tunnelId,
          this.log2,
          hostname,
          this.supabase,
        ).catch((cleanupError) =>
          this.log2.error(
            cleanupError,
            `Failed to cleanup tunnel ${tunnelId} after database update failure`,
          ),
        );
        throw updateError;
      }

      this.log2.info(
        'Successfully created replenished idle tunnel and hostname',
        {
          tunnelId,
          hostname,
        },
      );
    } catch (error) {
      // If anything fails, delete the placeholder entry
      await this.supabase
        .from('cloudflare_tunnels')
        .delete()
        .eq('id', placeholderEntry.id);
      throw error;
    }
  }

  public async retrieveIdleTunnelForAllocation(
    prototypeId: string,
  ): Promise<CloudflareTunnel> {
    // Use atomic RPC function to retrieve and allocate the oldest idle tunnel
    // This prevents race conditions where two concurrent requests could get the same tunnel
    const { data, error } = await this.supabase.rpc('allocate_idle_tunnel', {
      p_prototype_id: prototypeId,
    });

    if (error) {
      // Check if this is the "no idle tunnel" error
      if (error.message?.includes('NO_IDLE_TUNNEL')) {
        this.log2.error(
          'No idle tunnels found, falling back to direct launch, which is not yet implemented',
        );
        throw new Error(
          'Direct launch of cloudflare tunnels is not implemented or supported yet',
        );
      }
      // Some other error occurred
      this.log2.error(
        error,
        '[retrieveIdleTunnelForAllocation] Failed to allocate idle tunnel in supabase rpc function',
      );
      throw error;
    }

    // The RPC function returns a single cloudflare_tunnels record
    if (!data) {
      this.log2.error(
        new Error('RPC returned no data'),
        '[retrieveIdleTunnelForAllocation] Unexpected null response from allocate_idle_tunnel in supabase rpc function and direct launch is not supported yet',
      );
      throw new Error('Failed to allocate idle tunnel: no data returned');
    }

    // Launch a new idle tunnel in the background to replenish the pool
    this.launchIdleTunnelAndHostname().catch((e) =>
      this.log2.error(e, 'Failed to launch idle tunnel and hostname'),
    );

    return data;
  }
}
