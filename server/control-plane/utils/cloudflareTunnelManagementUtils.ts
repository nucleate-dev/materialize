import type { SystemLogger } from '../loggers/SystemLogger.js';
import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

type CfResp<T> = {
  success: boolean;
  result: T;
  errors?: unknown;
  messages?: unknown;
};

export async function createCloudflareTunnelForContainer(
  tunnelName: string,
  log2: SystemLogger,
): Promise<{
  tunnelId: string;
  token: string; // use in /allocate flow
  hostname: string; // <rand>.sandbox.nucleate.dev
  cnameTarget: string; // <tunnelId>.cfargotunnel.com
}> {
  let tunnelId: string | null = null;
  let hostname: string | null = null;

  try {
    // choose a random subdomain for this task
    const sub = Math.random().toString(36).slice(2, 10);
    hostname = `${sub}.sandbox.nucleate.dev`;

    // 1) Create the tunnel (returns id + token)
    const createTunnelResponse = await fetch(
      `${CLOUDFLARE_API_URL}/accounts/${process.env
        .CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tunnelName,
          config_src: 'cloudflare', // remote-config managed via API
        }),
      },
    );
    if (!createTunnelResponse.ok) {
      const text = await createTunnelResponse.text();
      throw new Error(
        `CF create tunnel failed: ${createTunnelResponse.status} ${text}`,
      );
    }
    const createTunnelResponseJson =
      (await createTunnelResponse.json()) as CfResp<{
        id: string;
        token: string; // present in response per docs
      }>;
    if (!createTunnelResponseJson.success) {
      throw new Error(
        `CF create tunnel not success: ${JSON.stringify(
          createTunnelResponseJson.errors,
        )}`,
      );
    }
    tunnelId = createTunnelResponseJson.result.id;
    const token = createTunnelResponseJson.result.token; // docs return token alongside id

    // 2) Configure ingress: only /ws/terminals/* → origin, then 404 catch-all
    // NOTE: path filtering is supported in ingress rules; keep 404 as final rule
    const putCfg = await fetch(
      `${CLOUDFLARE_API_URL}/accounts/${process.env
        .CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel/${tunnelId}/configurations`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            ingress: [
              {
                hostname,
                path: '/terminal/ws/*',
                service: 'http://localhost:3002',
                originRequest: {}, // optional; can add timeouts, headers, etc.
              },
              {
                hostname,
                path: '/code/ws/*',
                service: 'http://localhost:3002', // Claude Code WebSocket
                originRequest: {},
              },
              {
                hostname,
                path: '/update-files-v2',
                service: 'http://localhost:3002',
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/restart-v2',
                service: 'http://localhost:3002',
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/build-and-deploy',
                service: 'http://localhost:3002',
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/refetch-env',
                service: 'http://localhost:3002',
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/undo-last-change',
                service: `http://localhost:3002`,
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/connect-github',
                service: `http://localhost:3002`,
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/build-status',
                service: `http://localhost:3002`,
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/add-backend',
                service: `http://localhost:3002`,
                originRequest: {},
              },
              {
                hostname,
                path: '/dev-server/add-context',
                service: `http://localhost:3002`,
                originRequest: {},
              },
              {
                hostname,
                service: `http://127.0.0.1:19006`,
                originRequest: {},
              },
              { service: 'http_status:404' },
            ],
          },
        }),
      },
    );
    if (!putCfg.ok) {
      const text = await putCfg.text();
      throw new Error(`CF put tunnel config failed: ${putCfg.status} ${text}`);
    }
    const putJson = await putCfg.json();
    if (!putJson.success) {
      throw new Error(
        `CF put tunnel config not success: ${JSON.stringify(putJson.errors)}`,
      );
    }

    // 3) Create the DNS CNAME: <host> → <tunnelId>.cfargotunnel.com (proxied)
    const cnameTarget = `${tunnelId}.cfargotunnel.com`;
    const dnsRes = await fetch(
      `${CLOUDFLARE_API_URL}/zones/${process.env
        .CLOUDFLARE_ZONE_ID!}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CNAME',
          name: hostname,
          content: cnameTarget,
          proxied: true,
        }),
      },
    );
    if (!dnsRes.ok) {
      const text = await dnsRes.text();
      throw new Error(`CF create DNS failed: ${dnsRes.status} ${text}`);
    }
    const dnsJson = await dnsRes.json();
    if (!dnsJson.success) {
      throw new Error(
        `CF create DNS not success: ${JSON.stringify(dnsJson.errors)}`,
      );
    }
    return { tunnelId, token, hostname, cnameTarget };
  } catch (error) {
    // Cleanup: delete the tunnel if it was created
    if (tunnelId) {
      log2.warn(
        `Cleaning up Cloudflare tunnel ${tunnelId} due to error during setup`,
      );
      await deleteCloudflareTunnel(tunnelId, log2, hostname ?? undefined).catch(
        (cleanupError) => {
          log2.error(
            cleanupError,
            `Failed to cleanup tunnel ${tunnelId} after error`,
          );
        },
      );
    }
    throw error;
  }
}

export async function deleteCloudflareTunnel(
  tunnelId: string,
  log2: SystemLogger,
  hostname?: string,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  // Delete the tunnel first
  const deleteResponse = await fetch(
    `${CLOUDFLARE_API_URL}/accounts/${process.env
      .CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel/${tunnelId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!deleteResponse.ok) {
    const text = await deleteResponse.text();
    throw new Error(
      `Failed to delete tunnel ${tunnelId}: ${deleteResponse.status} ${text}`,
    );
  }

  log2.consoleLogDevOnly(
    'info',
    `Successfully deleted Cloudflare tunnel ${tunnelId}`,
  );

  // Delete the DNS record if hostname is provided
  if (hostname) {
    // Strip protocol prefixes if present
    let cleanHostname = hostname;
    if (hostname.startsWith('wss://')) {
      cleanHostname = hostname.substring(6);
    } else if (hostname.startsWith('https://')) {
      cleanHostname = hostname.substring(8);
    } else if (hostname.startsWith('http://')) {
      cleanHostname = hostname.substring(7);
    }

    log2.consoleLogDevOnly('info', 'deleting DNS record', {
      hostname: cleanHostname,
    });
    try {
      // Find the DNS record ID for this hostname
      const listDnsResponse = await fetch(
        `${CLOUDFLARE_API_URL}/zones/${process.env
          .CLOUDFLARE_ZONE_ID!}/dns_records?name=${cleanHostname}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (listDnsResponse.ok) {
        const listDnsJson = (await listDnsResponse.json()) as CfResp<
          Array<{ id: string; name: string }>
        >;

        if (listDnsJson.success && listDnsJson.result.length > 0) {
          const recordId = listDnsJson.result[0].id;

          // Delete the DNS record
          const deleteDnsResponse = await fetch(
            `${CLOUDFLARE_API_URL}/zones/${process.env
              .CLOUDFLARE_ZONE_ID!}/dns_records/${recordId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${process.env
                  .CLOUDFLARE_TUNNELS_API_KEY!}`,
                'Content-Type': 'application/json',
              },
            },
          );

          if (!deleteDnsResponse.ok) {
            const text = await deleteDnsResponse.text();
            log2.warn(
              `Failed to delete DNS record for ${cleanHostname}: ${deleteDnsResponse.status} ${text}`,
            );
          } else {
            log2.consoleLogDevOnly(
              'info',
              `Successfully deleted DNS record for ${cleanHostname}`,
            );
          }
        }
      } else {
        const text = await listDnsResponse.text();
        log2.warn(
          `Failed to list DNS records for ${cleanHostname}: ${listDnsResponse.status} ${text}`,
        );
      }
    } catch (error) {
      log2.error(error, `Error while deleting DNS record for ${cleanHostname}`);
      // Don't throw - tunnel is already deleted, DNS cleanup is best-effort
    }
  }

  // Delete from Supabase if supabase client is provided
  if (supabase) {
    log2.consoleLogDevOnly('info', 'deleting Supabase', { hostname });
    try {
      const { error: deleteError } = await supabase
        .from('cloudflare_tunnels')
        .delete()
        .eq('tunnel_id', tunnelId);

      if (deleteError) {
        log2.error(
          deleteError,
          `Failed to delete tunnel ${tunnelId} from Supabase database`,
        );
      } else {
        log2.consoleLogDevOnly(
          'info',
          `Successfully deleted tunnel ${tunnelId} from Supabase`,
        );
      }
    } catch (error) {
      log2.error(
        error,
        `Error while deleting tunnel ${tunnelId} from Supabase`,
      );
      // Don't throw - Cloudflare resources are already cleaned up
    }
  }
}
