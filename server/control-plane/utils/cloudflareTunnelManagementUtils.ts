import type { SystemLogger } from '../loggers/SystemLogger.js';

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

type CfResp<T> = {
  success: boolean;
  result: T;
  errors?: unknown;
  messages?: unknown;
};

export async function createCloudflareTunnelForContainer(
  prototypeId: string,
  taskArn: string,
  log2: SystemLogger,
): Promise<{
  tunnelId: string;
  token: string; // use in /allocate flow
  hostname: string; // <rand>.terminals.materializeui.com
  cnameTarget: string; // <tunnelId>.cfargotunnel.com
}> {
  let tunnelId: string | null = null;

  try {
    // choose a random subdomain for this task
    const sub = Math.random().toString(36).slice(2, 10);
    const hostname = `${sub}.terminals.materializeui.com`;

    // 1) Create the tunnel (returns id + token)
    const createTunnelResponse = await fetch(
      `${CLOUDFLARE_API_URL}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_TUNNELS_API_KEY!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: prototypeId + '-' + taskArn.substring(22, 31) + sub,
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
        `CF create tunnel not success: ${JSON.stringify(createTunnelResponseJson.errors)}`,
      );
    }
    tunnelId = createTunnelResponseJson.result.id;
    const token = createTunnelResponseJson.result.token; // docs return token alongside id

    // 2) Configure ingress: only /ws/terminals/* → origin, then 404 catch-all
    // NOTE: path filtering is supported in ingress rules; keep 404 as final rule
    const putCfg = await fetch(
      `${CLOUDFLARE_API_URL}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel/${tunnelId}/configurations`,
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
                path: '/terminal/*/ws',
                service: 'http://localhost:3002',
                originRequest: {}, // optional; can add timeouts, headers, etc.
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
    if (!putJson.success)
      throw new Error(
        `CF put tunnel config not success: ${JSON.stringify(putJson.errors)}`,
      );

    // 3) Create the DNS CNAME: <host> → <tunnelId>.cfargotunnel.com (proxied)
    const cnameTarget = `${tunnelId}.cfargotunnel.com`;
    const dnsRes = await fetch(
      `${CLOUDFLARE_API_URL}/zones/${process.env.CLOUDFLARE_ZONE_ID!}/dns_records`,
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
      await deleteCloudflareTunnel(tunnelId, log2).catch((cleanupError) => {
        log2.error(
          cleanupError,
          `Failed to cleanup tunnel ${tunnelId} after error`,
        );
      });
    }
    throw error;
  }
}

export async function deleteCloudflareTunnel(
  tunnelId: string,
  log2: SystemLogger,
): Promise<void> {
  const deleteResponse = await fetch(
    `${CLOUDFLARE_API_URL}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID!}/cfd_tunnel/${tunnelId}`,
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

  log2.info(`Successfully deleted Cloudflare tunnel ${tunnelId}`);
}
