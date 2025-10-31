import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';

const MAX_IDLE_TUNNELS: number = 1;

export class IdleContainerAllocationSystemService {
  private readonly log2: SystemLogger;
  private maintenanceTimer?: NodeJS.Timeout;
  private supabase: SupabaseClient;

  constructor(opts: { log2: SystemLogger }) {
    this.log2 = opts.log2.child({
      route: 'IdleContainerAllocationSystemService',
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
    if (process.env.NODE_ENV === 'development') return; // no idle containers in development mode

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
      // 2. Concurrently delete the tunnels and hostnames from cloudflare && remove from supabase idle pool
      await Promise.all([]);

      return;
    }
  }

  /** Launch one idle tunnel and hostname */
  private async launchIdleTunnelAndHostname(): Promise<void> {
    // 1. Immediately add a placeholder entry in supabase idle pool with status 'creating'
    // 1. Create a new tunnel and hostname in cloudflare using the cloudflareTunnelManagementUtils.ts
    // 2. Update all the tunnel information in the supabase idle pool (tunnel_id, hostname, token, DNS, etc.) and set status to 'idle'
  }

  public async retrieveIdleTunnelForAllocation(
    prototypeId: string,
  ): Promise<Record<string, unknown>> {
    // 1. Try to retrieve the oldest idle tunnel and hostname from the supabase idle pool with status 'idle'
    const { data, error } = await this.supabase
      .from('cloudflare_tunnels')
      .select('*')
      .eq('status', 'idle')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      this.log2.error(error, 'Failed to retrieve idle tunnel and hostname');
      throw error;
    }
    if (!data) {
      this.log2.info('No idle tunnels found, falling back to direct launch');
      throw new Error(
        'Direct launch of cloudflare tunnelsis not implemented or supported yet',
      );
    }

    // 2. We have an idle tunnel and hostname. Set supabase status to 'allocated' and prototype_id to the given prototypeId
    const { data: updatedData, error: updateError } = await this.supabase
      .from('cloudflare_tunnels')
      .update({ status: 'allocated', prototype_id: prototypeId })
      .eq('id', data.id)
      .select('*')
      .maybeSingle();
    if (updateError) {
      this.log2.error(updateError, 'Failed to update idle tunnel and hostname');
      throw updateError;
    }

    this.launchIdleTunnelAndHostname().catch((e) =>
      this.log2.error(e, 'Failed to launch idle tunnel and hostname'),
    );

    return updatedData;
  }
}
