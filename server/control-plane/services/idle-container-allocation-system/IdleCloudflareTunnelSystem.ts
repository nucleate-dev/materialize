import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import {
  createCloudflareTunnelForContainer,
  deleteCloudflareTunnel,
} from '../../utils/cloudflareTunnelManagementUtils.js';
import type { Database, TablesInsert, TablesUpdate } from '../../types/supabase.js';

const MAX_IDLE_TUNNELS: number = 0;

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
      this.log2.consoleLogDevOnly(
        'info',
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
      .insert({ status: 'creating' } satisfies TablesInsert<'cloudflare_tunnels'>)
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
      const tunnelName = placeholderEntry.id;
      if (!tunnelName) {
        throw new Error('Placeholder tunnel entry missing id');
      }
      const { tunnelId, token, hostname, cnameTarget } =
        await createCloudflareTunnelForContainer(tunnelName, this.log2);

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
        } satisfies TablesUpdate<'cloudflare_tunnels'>)
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

      this.log2.consoleLogDevOnly(
        'info',
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
        this.log2.warn(
          'No idle tunnels found, falling back to direct launch, which is not yet implemented',
        );
        return await this.launchTunnelForAllocationDirectly(prototypeId);
      } else {
        // Some other error occurred
        this.log2.error(
          error,
          '[retrieveIdleTunnelForAllocation] Failed to allocate idle tunnel in supabase rpc function',
        );
        throw error;
      }
    }

    // The RPC function returns a single cloudflare_tunnels record
    if (!data) {
      this.log2.warn(
        '[retrieveIdleTunnelForAllocation] Unexpected null response from allocate_idle_tunnel in supabase rpc function and direct launch is not supported yet',
      );
      return await this.launchTunnelForAllocationDirectly(prototypeId);
    }

    // Launch a new idle tunnel in the background to replenish the pool
    this.launchIdleTunnelAndHostname().catch((e) =>
      this.log2.error(e, 'Failed to launch idle tunnel and hostname'),
    );

    return data;
  }

  public async launchTunnelForAllocationDirectly(
    prototypeId: string,
  ): Promise<CloudflareTunnel> {
    // This function is used to launch a new tunnel and hostname directly without using the idle pool
    // This is used when there are no idle tunnels available
    // This is a fallback mechanism to ensure that we always have a tunnel available for allocation

    this.log2.warn(
      'No idle tunnels available, launching tunnel directly for immediate allocation',
    );

    // 1. Create a placeholder entry in the database with status 'creating'
    const { data: placeholderEntry, error: insertError } = await this.supabase
      .from('cloudflare_tunnels')
      .insert({ status: 'creating', prototype_id: prototypeId } satisfies TablesInsert<'cloudflare_tunnels'>)
      .select('*')
      .single();

    if (insertError || !placeholderEntry) {
      this.log2.error(
        insertError,
        'Failed to create placeholder entry for direct tunnel launch',
      );
      throw insertError || new Error('Failed to create placeholder entry');
    }

    try {
      // 2. Create the tunnel and hostname in Cloudflare
      const tunnelName = placeholderEntry.id;
      if (!tunnelName) {
        throw new Error('Placeholder tunnel entry missing id');
      }

      this.log2.consoleLogDevOnly(
        'info',
        `Creating tunnel directly for immediate allocation: ${tunnelName}`,
      );

      const { tunnelId, token, hostname, cnameTarget } =
        await createCloudflareTunnelForContainer(tunnelName, this.log2);

      // 3. Update the database entry with tunnel info and set status to 'allocated'
      // Note: We set it to 'allocated' instead of 'idle' since this is for immediate use
      const { data: allocatedTunnel, error: updateError } = await this.supabase
        .from('cloudflare_tunnels')
        .update({
          tunnel_id: tunnelId,
          hostname: hostname,
          token: token,
          cname_target: cnameTarget,
          status: 'allocated',
          prototype_id: prototypeId,
        } satisfies TablesUpdate<'cloudflare_tunnels'>)
        .eq('id', placeholderEntry.id)
        .select('*')
        .single();

      if (updateError || !allocatedTunnel) {
        this.log2.error(
          updateError,
          'Failed to update tunnel entry after direct creation',
        );
        // Clean up the Cloudflare tunnel since we couldn't update the database
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
        throw updateError || new Error('Failed to update tunnel entry');
      }

      this.log2.consoleLogDevOnly(
        'info',
        'Successfully created tunnel directly for allocation',
        {
          tunnelId,
          hostname,
        },
      );
      // // Launch a new idle tunnel in the background to replenish the pool
      // this.launchIdleTunnelAndHostname().catch((e) =>
      //   this.log2.error(
      //     e,
      //     'Failed to launch idle tunnel and hostname after direct launch',
      //   ),
      // );
      return allocatedTunnel;
    } catch (error) {
      // Clean up the placeholder entry on any failure
      await this.supabase
        .from('cloudflare_tunnels')
        .delete()
        .eq('id', placeholderEntry.id);
      throw error;
    }
  }

  // --------- FOR REFERENCE: Supabase RPC function --------------------------------------------------------------
  // create or replace function public.allocate_idle_tunnel(p_prototype_id text)
  // returns public.cloudflare_tunnels
  // language plpgsql
  // security definer
  // set search_path = public
  // as $$
  // declare
  //   t public.cloudflare_tunnels;
  // begin
  //   -- If you support reclaiming stale leases, you can do it here first.

  //   update public.cloudflare_tunnels c
  //      set status = 'allocated',
  //          prototype_id = p_prototype_id,
  //          updated_at = now()
  //    where c.id = (
  //      select id
  //        from public.cloudflare_tunnels
  //       where status = 'idle'
  //       order by created_at asc
  //       for update skip locked
  //       limit 1
  //    )
  //   returning c.* into t;

  //   if not found then
  //     raise exception 'NO_IDLE_TUNNEL';
  //   end if;

  //   return t;
  // end;
  // $$;

  // comment on function public.allocate_idle_tunnel(text)
  //   is 'Atomically allocate the oldest idle Cloudflare tunnel using SKIP LOCKED to avoid races.';

  // revoke all on function public.allocate_idle_tunnel(text) from public;
  // grant execute on function public.allocate_idle_tunnel(text) to service_role;
}
