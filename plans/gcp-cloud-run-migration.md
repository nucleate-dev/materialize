# GCP Cloud Run Migration Plan

## Overview

This plan outlines the migration from AWS Fargate with idle container pooling to Google Cloud Run for sandbox containers. The goal is to reduce costs by eliminating the need for pre-warmed idle containers, leveraging Cloud Run's manual scaling capabilities.

---

## Cloud Run Manual Scaling: The Key Feature

Cloud Run supports **[Manual Scaling](https://cloud.google.com/run/docs/configuring/services/manual-scaling)** which solves our statefulness requirements:

### How Manual Scaling Works

1. **You control the exact instance count** - no automatic scale-to-zero
2. **Instances stay running** until you explicitly set count to 0
3. **Changes via API are fast** - no new deployment required
4. **State persists** as long as the instance is running

> "Changing scaling mode from automatic to manual or vice-versa, or changing the manual instance count **does not create a new revision**"

### Proposed Architecture: Pre-deployed Service Pool

Since initial service creation takes several minutes, we use a **pool of pre-deployed services**:

```
Pre-deployed Cloud Run Services (all at manualInstanceCount: 0):
├── nucleate-sandbox-001  (available)
├── nucleate-sandbox-002  (available)
├── nucleate-sandbox-003  (in use by prototype-abc)
├── nucleate-sandbox-004  (available)
└── ... (pool size configurable)
```

**Allocation flow:**
1. Find an available service from the pool
2. PATCH it to `manualInstanceCount: 1` (fast - no deployment)
3. Wait for instance to start (~2-5 seconds cold start)
4. Call `/allocate` endpoint to configure for the prototype

**Cleanup flow:**
1. PATCH the service to `manualInstanceCount: 0`
2. Instance terminates, service returns to pool

---

## Key Research Findings: Cloud Run Networking & Cold Starts

### Public URL / Tunneling

**Good news: Cloud Run provides built-in public HTTPS URLs with automatic TLS.**

- Every Cloud Run service gets a stable HTTPS URL on `*.run.app` domain (e.g., `https://my-service-abc123.us-central1.run.app`)
- Cloud Run handles TLS termination automatically - no Cloudflare tunnels needed for basic HTTP access
- Custom domains are supported with automatic SSL certificate provisioning
- WebSocket support is built-in

**Implications:**
- We can **eliminate the Cloudflare tunnel dependency** for the main dev server URL
- The `terminal_tunnel_id` and `terminal_tunnel_hostname` fields in `ActiveBuild` may still be needed if we want to keep the current tunnel architecture for consistency, OR we can simplify by using Cloud Run's native URLs
- No VPC/private IP networking complexity - Cloud Run services are publicly accessible by default

### Cold Start Performance

Based on research:
- Cold starts typically range from **500ms to 2 seconds** for most applications
- Cold start is **independent of image size** - it depends on application initialization time
- Optimization features available:
  - **Startup CPU Boost**: Temporarily increases CPU during startup
  - **Minimum instances**: Can set min=1 to keep one instance warm (costs money but eliminates cold starts)
  - **Concurrency settings**: Tune how many requests per instance

**Our container considerations:**
- The build-worker Dockerfile has heavy dependencies (Puppeteer libs, Bun, Node, Watchman, cloudflared, etc.)
- Expected cold start: **2-5 seconds** (likely on higher end due to complexity)
- This is still acceptable vs. the ~30-60 second Fargate cold start

### Cloud Run Services vs Jobs

**We need Cloud Run Services** (not Jobs) because:
- Services listen for HTTP requests indefinitely
- Services scale to zero when not in use
- Services support WebSockets (needed for chat/terminal)
- Jobs are for batch processing that runs to completion

---

## Architecture Changes

### Environment Variable Configuration

```bash
# New environment variable to control sandbox provider
SANDBOX_PROVIDER=gcp  # Options: "aws" | "gcp"

# GCP-specific configuration (only needed when SANDBOX_PROVIDER=gcp)
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
GCP_CLOUD_RUN_SERVICE_NAME=nucleate-sandbox
GCP_SERVICE_ACCOUNT_EMAIL=sandbox@your-project.iam.gserviceaccount.com

# Existing AWS config remains for backward compatibility
ECS_CLUSTER_NAME=...
ECS_SUBNETS=...
ECS_SECURITY_GROUPS=...
```

### Cache Structure Changes

The `ActiveBuild` type needs a new field to track which provider is hosting the sandbox:

```typescript
// In InternalTypes.ts
export type SandboxProvider = 'aws' | 'gcp';

export interface ActiveBuild {
  fargate_task_arn: string;        // For AWS: task ARN, For GCP: Cloud Run revision URL or instance ID
  fargate_private_ip: string;      // For AWS: private IP, For GCP: empty (not needed)
  url: string;                     // For GCP: this becomes the Cloud Run service URL
  status: BuildStatus;
  last_touched: number;
  terminal_tunnel_id: string;      // For AWS: Cloudflare tunnel ID, For GCP: empty or keep for consistency
  terminal_tunnel_hostname: string; // For AWS: tunnel hostname, For GCP: Cloud Run URL (wss://...)
  orchestration_token: string;
  clean_attempts: number;
  sandbox_provider: SandboxProvider; // NEW: Track which provider is hosting this sandbox
}
```

### IdleContainerAllocationSystemService Changes

The service will be modified to support both providers:

```typescript
// Pseudocode structure

class IdleContainerAllocationSystemService {
  private readonly sandboxProvider: SandboxProvider;
  private readonly cloudRunClient?: CloudRunClient; // @google-cloud/run

  constructor(opts: {...}) {
    this.sandboxProvider = (process.env.SANDBOX_PROVIDER as SandboxProvider) || 'aws';

    if (this.sandboxProvider === 'gcp') {
      this.cloudRunClient = new CloudRunClient();
      // No idle container maintenance needed for GCP
    }
  }

  public async init(): Promise<void> {
    if (this.sandboxProvider === 'aws') {
      // Existing idle pool maintenance logic
      this.maintenanceTimer = setInterval(...);
      await this.ensureIdleCapacity();
    }
    // GCP: No idle containers needed - Cloud Run handles this
  }

  public async allocateFargateDevServer(...): Promise<FargateInstanceInfo> {
    if (this.sandboxProvider === 'gcp') {
      return await this.allocateCloudRunInstance(...);
    }
    // Existing AWS Fargate logic
    return await this.allocateAWSFargateInstance(...);
  }

  private async allocateCloudRunInstance(
    prototypeId: string,
    activeBuildKey: string,
    newBuildCacheData: ActiveBuild,
    jwt: string,
    userId: string,
  ): Promise<FargateInstanceInfo> {
    // 1. Create/invoke Cloud Run service instance
    // 2. Get the service URL (no private IP needed)
    // 3. Call /allocate endpoint to configure the instance
    // 4. Return info with Cloud Run URL as the tunnel hostname
  }
}
```

---

## Detailed Implementation Steps

### Phase 1: GCP Setup & Authentication

1. **Create GCP Project** (if not exists)
2. **Enable Cloud Run API**
3. **Create Service Account** with roles:
   - `roles/run.admin` (to create/manage services)
   - `roles/storage.admin` (if using GCS)
   - `roles/iam.serviceAccountUser`
4. **Set up Workload Identity** or download service account key for local dev
5. **Push Docker image to GCR/Artifact Registry**:
   ```bash
   # Tag and push existing build-worker image
   docker tag nucleate-build-worker gcr.io/$PROJECT_ID/nucleate-sandbox:latest
   docker push gcr.io/$PROJECT_ID/nucleate-sandbox:latest
   ```

### Phase 2: Modify InternalTypes.ts

```typescript
// Add new type
export type SandboxProvider = 'aws' | 'gcp';

// Modify ActiveBuild
export interface ActiveBuild {
  // ... existing fields ...
  sandbox_provider: SandboxProvider;
}

// Modify FargateInstanceInfo (consider renaming to SandboxInstanceInfo)
export interface SandboxInstanceInfo {
  taskArn: string;           // AWS: task ARN, GCP: service URL
  privateIp: string;         // AWS: IP, GCP: empty
  terminalTunnelId: string;  // AWS: tunnel ID, GCP: empty
  terminalTunnelHostname: string; // AWS: tunnel hostname, GCP: Cloud Run URL
  orchestrationToken: string;
  sandboxProvider: SandboxProvider;
}
```

### Phase 3: Modify IdleContainerAllocationSystemService

1. **Add GCP client initialization**:
   ```typescript
   import { ServicesClient } from '@google-cloud/run';

   private readonly cloudRunClient?: ServicesClient;

   // Cache keys for GCP service pool
   private readonly GCP_SERVICE_POOL_KEY = 'gcp:service_pool';
   private readonly GCP_SERVICE_ASSIGNMENT_KEY = (serviceName: string) =>
     `gcp:service:${serviceName}`;

   constructor(opts: {...}) {
     if (this.sandboxProvider === 'gcp') {
       this.cloudRunClient = new ServicesClient();
     }
   }
   ```

2. **Initialize GCP service pool tracking** (services are pre-deployed):
   ```typescript
   public async init(): Promise<void> {
     if (this.sandboxProvider === 'gcp') {
       this.log2.info('Using GCP Cloud Run with manual scaling');
       // Services are pre-deployed - just verify pool exists in cache
       await this.ensureGcpServicePoolTracking();
       return;
     }
     // Existing AWS idle pool logic
   }

   private async ensureGcpServicePoolTracking(): Promise<void> {
     // Pre-deployed services: nucleate-sandbox-001, nucleate-sandbox-002, etc.
     const poolSize = parseInt(process.env.GCP_SERVICE_POOL_SIZE || '10');
     const existingPool = await this.cache.smembers(this.GCP_SERVICE_POOL_KEY);

     if (existingPool.length === 0) {
       // Initialize pool tracking
       const serviceNames = Array.from({ length: poolSize }, (_, i) =>
         `nucleate-sandbox-${String(i + 1).padStart(3, '0')}`
       );
       await this.cache.sadd(this.GCP_SERVICE_POOL_KEY, serviceNames);
     }
   }
   ```

3. **Add Cloud Run allocation method with manual scaling**:
   ```typescript
   private async allocateCloudRunInstance(
     prototypeId: string,
     activeBuildKey: string,
     newBuildCacheData: ActiveBuild,
     jwt: string,
     userId: string,
   ): Promise<SandboxInstanceInfo> {
     // 1. Get an available service from the pool
     const serviceName = await this.acquireGcpService(prototypeId);
     if (!serviceName) {
       throw new Error('No available Cloud Run services in pool');
     }

     const serviceUrl = `https://${serviceName}-${GCP_PROJECT_HASH}.${GCP_REGION}.run.app`;

     // 2. Set manual scaling to 1 instance (starts the container)
     await this.setCloudRunManualScale(serviceName, 1);

     // 3. Wait for instance to be ready (poll health endpoint)
     await this.waitForCloudRunReady(serviceUrl);

     // 4. Call /allocate on the Cloud Run service
     const orchestrationToken = randomBytes(32).toString('hex');
     const creds = {
       s3_credentials: await this.assumeS3Role(prototypeId),
       user_details: { prototypeId, userId },
       keys: { orchestration_token: orchestrationToken, aak: platformCredential },
     };

     await axios.post(`${serviceUrl}/allocate`, creds, {
       headers: { Authorization: `Bearer ${jwt}` },
     });

     // 5. Update cache with GCP-specific data
     await this.cache.hset(activeBuildKey, {
       ...newBuildCacheData,
       fargate_task_arn: serviceName,  // Store service name for cleanup
       fargate_private_ip: '',
       terminal_tunnel_hostname: `wss://${serviceUrl.replace('https://', '')}`,
       sandbox_provider: 'gcp',
     });

     return {
       taskArn: serviceName,
       privateIp: '',
       terminalTunnelId: '',
       terminalTunnelHostname: `wss://${serviceUrl.replace('https://', '')}`,
       orchestrationToken,
       sandboxProvider: 'gcp',
     };
   }

   private async acquireGcpService(prototypeId: string): Promise<string | null> {
     // Atomically pop a service from the available pool
     const serviceName = await this.cache.spop(this.GCP_SERVICE_POOL_KEY);
     if (!serviceName) return null;

     // Mark it as assigned to this prototype
     await this.cache.set(
       this.GCP_SERVICE_ASSIGNMENT_KEY(serviceName as string),
       prototypeId
     );
     return serviceName as string;
   }

   private async setCloudRunManualScale(
     serviceName: string,
     instanceCount: number
   ): Promise<void> {
     const servicePath = `projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/services/${serviceName}`;

     await this.cloudRunClient!.updateService({
       service: {
         name: servicePath,
         scaling: {
           scalingMode: 'MANUAL',
           manualInstanceCount: instanceCount,
         },
       },
       updateMask: { paths: ['scaling'] },
     });
   }

   private async waitForCloudRunReady(
     serviceUrl: string,
     timeoutMs = 30000
   ): Promise<void> {
     const startTime = Date.now();
     while (Date.now() - startTime < timeoutMs) {
       try {
         const response = await axios.get(`${serviceUrl}/health`, { timeout: 2000 });
         if (response.status === 200) return;
       } catch {
         // Not ready yet
       }
       await new Promise(resolve => setTimeout(resolve, 500));
     }
     throw new Error(`Cloud Run service ${serviceUrl} did not become ready in time`);
   }
   ```

### Phase 4: Modify CleanupService

1. **Handle GCP cleanup with manual scaling to 0**:
   ```typescript
   public async cleanupSingleBuild(
     build: ActiveBuild,
     buildId: string,
     buildKey: string,
   ): Promise<CleanupOperationResult> {
     if (build.sandbox_provider === 'gcp') {
       return await this.cleanupCloudRunBuild(build, buildId, buildKey);
     }
     // Existing AWS cleanup logic
   }

   private async cleanupCloudRunBuild(
     build: ActiveBuild,
     buildId: string,
     buildKey: string,
   ): Promise<CleanupOperationResult> {
     const serviceName = build.fargate_task_arn; // We stored service name here
     const prototypeId = buildId.split('_')[1];

     // 1. Call /cleanup on the service to clean up S3 resources
     const serviceUrl = `https://${serviceName}-${GCP_PROJECT_HASH}.${GCP_REGION}.run.app`;
     try {
       await axios.delete(`${serviceUrl}/cleanup`, { timeout: 5000 });
     } catch (e) {
       this.log2.warn('Failed to call cleanup endpoint', { serviceName, error: e });
     }

     // 2. Set manual scaling to 0 (stops the instance)
     try {
       await this.setCloudRunManualScale(serviceName, 0);
     } catch (e) {
       this.log2.error(e, 'Failed to scale down Cloud Run service', { serviceName });
       return { success: false, buildInProgress: false, error: 'Failed to stop service' };
     }

     // 3. Return service to the available pool
     await this.cache.del([this.GCP_SERVICE_ASSIGNMENT_KEY(serviceName)]);
     await this.cache.sadd(this.GCP_SERVICE_POOL_KEY, [serviceName]);

     // 4. Remove from cache
     await removeBuildDataFromCache(this.cache, this.log2, prototypeId, buildId);

     return { success: true, buildInProgress: false };
   }
   ```

2. **No Cloudflare tunnel cleanup needed for GCP** - Cloud Run handles TLS

### Phase 5: Modify Build Worker for Cloud Run Compatibility

The build-worker needs minor changes to work with Cloud Run:

1. **Listen on PORT environment variable** (Cloud Run sets this):
   ```typescript
   const port = process.env.PORT || 3002;
   ```

2. **Handle Cloud Run health checks**:
   - Cloud Run sends requests to `/` by default
   - Add a health check endpoint if not exists

3. **Remove/skip cloudflared tunnel setup** when running on GCP:
   ```typescript
   if (process.env.SANDBOX_PROVIDER !== 'gcp') {
     // Start cloudflared tunnel
   }
   ```

---

## Cloud Run Deployment Configuration

Create `cloudrun.yaml`:

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: nucleate-sandbox
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/startup-cpu-boost: "true"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 1  # Each instance handles one prototype
      timeoutSeconds: 3600     # 1 hour max
      containers:
        - image: gcr.io/PROJECT_ID/nucleate-sandbox:latest
          ports:
            - containerPort: 3002
          resources:
            limits:
              cpu: "2"
              memory: "4Gi"
          env:
            - name: NODE_ENV
              value: production
            - name: SANDBOX_PROVIDER
              value: gcp
            # ... other env vars
```

---

## Migration Checklist

### Before Migration
- [ ] Set up GCP project and enable Cloud Run API
- [ ] Create and configure service account
- [ ] Build and push Docker image to GCR
- [ ] Test Cloud Run deployment manually

### Code Changes
- [ ] Add `SandboxProvider` type to `InternalTypes.ts`
- [ ] Add `sandbox_provider` field to `ActiveBuild` interface
- [ ] Add GCP Cloud Run client to `IdleContainerAllocationSystemService`
- [ ] Implement `allocateCloudRunInstance()` method
- [ ] Modify `init()` to skip idle pool for GCP
- [ ] Update `CleanupService` to handle GCP builds
- [ ] Add `SANDBOX_PROVIDER` environment variable handling
- [ ] Update build-worker to conditionally skip cloudflared

### Testing
- [ ] Test AWS Fargate path still works with `SANDBOX_PROVIDER=aws`
- [ ] Test GCP Cloud Run path with `SANDBOX_PROVIDER=gcp`
- [ ] Verify cold start times are acceptable
- [ ] Test cleanup/scale-to-zero behavior
- [ ] Load test concurrent prototype allocations

### Deployment
- [ ] Deploy Cloud Run service to GCP
- [ ] Update control-plane environment variables
- [ ] Gradually roll out (canary deployment)
- [ ] Monitor for issues
- [ ] Once stable, set `SANDBOX_PROVIDER=gcp` as default

---

## Cost Comparison Estimate

### Current (AWS Fargate with Idle Container)
- 1 idle container running 24/7: ~$30-50/month (0.5 vCPU, 1GB RAM)
- Active containers: charged per use
- Cloudflare tunnels: operational overhead

### GCP Cloud Run
- No idle containers needed
- Pay only when handling requests
- Built-in TLS/routing (no tunnel costs)
- Estimated 50-70% cost reduction for low-traffic scenarios

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Cold starts too slow | Enable startup CPU boost; set `minScale: 1` if needed |
| GCP outages | Keep AWS path as fallback via env var |
| Migration bugs | Feature flag allows instant rollback |
| Different networking model | Test WebSocket connectivity thoroughly |
| Container image too large | Optimize Dockerfile for faster pulls |

---

## Open Questions

1. **How many services in the pre-deployed pool?**
   - Start with 10-20 services
   - Monitor concurrent usage and scale pool as needed
   - Each service at `manualInstanceCount: 0` costs nothing

2. **How to handle long-running dev servers?**
   - Cloud Run supports up to 60 min request timeout
   - For longer sessions, ensure WebSocket keepalive and touch the `last_touched` in cache
   - Cleanup service will only scale down truly idle sandboxes

3. **S3 access from GCP?**
   - Cross-cloud S3 access works but adds latency (~50-100ms extra)
   - Consider GCS for GCP deployments (future optimization)

4. **How fast is `setCloudRunManualScale()`?**
   - The API call itself is fast (sub-second)
   - Instance cold start is the real latency (~2-5 seconds)
   - This is acceptable compared to current Fargate cold start (~30-60s)

5. **Service pool exhaustion?**
   - If all services in pool are in use, allocation fails
   - Could dynamically create new services (slow) or return error to user
   - Monitoring needed to right-size the pool

---

---

## Alternative: Cloudflare Sandbox SDK

Cloudflare offers a [Sandbox SDK](https://developers.cloudflare.com/sandbox/) that may be an even better fit for our use case.

### What is Cloudflare Sandbox?

The Sandbox SDK enables you to run untrusted code securely in isolated environments. Built on [Cloudflare Containers](https://developers.cloudflare.com/containers/), it provides:
- Full Linux environment per sandbox
- File system, shell sessions, background processes
- WebSocket support
- Automatic HTTPS URLs on Cloudflare's edge network

### Why It's a Good Fit

From the [Sandbox documentation](https://developers.cloudflare.com/sandbox/concepts/sandboxes/):

> "Imagine you are building a platform where end-users can run code generated by an LLM. This code is untrusted, so each user needs their own secure sandbox. Additionally, you want users to be able to run multiple requests in sequence, potentially writing to local files or saving in-memory state."

This is **exactly our use case**.

### Lifecycle & State Management

| State | Behavior |
|-------|----------|
| **Active** | Container running, all state persists (files, processes, shell sessions) |
| **Idle** | After 10 min inactivity (configurable via `sleepAfter`), container sleeps |
| **KeepAlive** | With `keepAlive: true`, sends heartbeat every 30s, never auto-sleeps |
| **Destroyed** | All state deleted, can be explicit or automatic |

### Key Difference from Cloud Run

- **Cloud Run**: Scale to 0 = container terminated, state lost
- **Cloudflare Sandbox**: Sleep = container paused, can wake up (though state may be lost on sleep)
- **Cloudflare Sandbox with `keepAlive: true`**: Container stays running, we control lifecycle

### Instance Types Available

| Type | vCPU | Memory |
|------|------|--------|
| lite | 1/16 | 256 MiB |
| basic | 1/4 | 1 GiB |
| standard-1 | 1/2 | 2 GiB |
| standard-2 | 1 | 4 GiB |
| standard-3 | 2 | 8 GiB |
| standard-4 | 4 | 12 GiB |

For our build worker, **standard-2** (1 vCPU, 4 GiB) or **standard-3** (2 vCPU, 8 GiB) would be appropriate.

### Pricing

From [Sandbox Pricing](https://developers.cloudflare.com/sandbox/platform/pricing/):

- **CPU**: $0.00002 per vCPU-second (only charged for actual CPU usage, not idle time)
- **Memory/Disk**: Based on provisioned resources
- **Egress**: $0.025/GB (North America/Europe), 1 TB included

**Example cost**: Running standard-2 (1 vCPU) for 1 hour at 20% CPU utilization:
```
1 vCPU × 3600 seconds × $0.00002 × 20% = $0.0144
```

### Cold Start Considerations

- Cold starts for containers are typically **3-5 seconds** (similar to Cloud Run)
- With `keepAlive: true`, no cold starts (container stays warm)
- Cloudflare's edge network means lower latency to users globally

### Implementation Approach

```typescript
import Sandbox from "@anthropic/sandbox";

// Create sandbox for a prototype
const sandbox = new Sandbox({
  id: `prototype-${prototypeId}`,
  keepAlive: true,  // Prevent auto-sleep, we control lifecycle
  instanceType: "standard-2",
});

// Execute commands, manage files
await sandbox.commands.run("npm start");
await sandbox.files.write("/workspace/app.tsx", code);

// Get public URL for the sandbox
const url = sandbox.getUrl(); // Returns https://xxx.sandbox.cloudflare.com

// Cleanup when done
await sandbox.destroy();
```

### Comparison: GCP Cloud Run vs Cloudflare Sandbox

| Aspect | GCP Cloud Run | Cloudflare Sandbox |
|--------|---------------|-------------------|
| **Architecture** | Pre-deploy service pool, manual scaling | On-demand sandbox creation |
| **Cold start** | 2-5 seconds | 3-5 seconds |
| **State persistence** | Manual control via scaling | `keepAlive: true` keeps container running |
| **Networking** | Built-in HTTPS | Built-in HTTPS on edge |
| **Global distribution** | Single region | Edge locations worldwide |
| **Pricing model** | Per-instance billing | CPU-time billing (more granular) |
| **SDK/API** | REST API to Cloud Run Admin | Purpose-built SDK |
| **Complexity** | Higher (service pool management) | Lower (SDK handles lifecycle) |

### Recommendation

**Cloudflare Sandbox may be the better option** because:

1. **Purpose-built for our use case** - Designed for AI agents running code
2. **Simpler architecture** - No need to pre-deploy service pool
3. **SDK handles lifecycle** - Less custom code needed
4. **Edge distribution** - Lower latency globally
5. **Granular billing** - Pay for CPU time, not instance time

### Next Steps for Cloudflare Evaluation

1. Sign up for Cloudflare Containers beta
2. Test Sandbox SDK with our build-worker Docker image
3. Measure actual cold start times and performance
4. Compare costs with current Fargate setup
5. Evaluate WebSocket support for chat/terminal

---

## Sources

- [Cloud Run Manual Scaling](https://cloud.google.com/run/docs/configuring/services/manual-scaling) - Key feature for stateful containers
- [Cloud Run Instance Autoscaling](https://cloud.google.com/run/docs/about-instance-autoscaling)
- [Cloud Run Ingress Settings](https://docs.google.com/run/docs/securing/ingress)
- [Cloud Run Public Access](https://cloud.google.com/run/docs/authenticating/public)
- [Cloud Run Custom Domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [Cloud Run Cold Starts](https://blog.devops.dev/the-truth-about-cold-starts-in-google-cloud-run-functions-efb1c5bccfda)
- [Startup CPU Boost](https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions)
- [Cloud Run vs Lambda Benchmarks](https://iamondemand.com/blog/google-cloud-run-vs-aws-lambda-performance-benchmarks-part-2/)
- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/) - Purpose-built for code execution
- [Cloudflare Containers](https://blog.cloudflare.com/containers-are-available-in-public-beta-for-simple-global-and-programmable/)
- [Sandbox Lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)
- [Sandbox Pricing](https://developers.cloudflare.com/sandbox/platform/pricing/)
- [Container Limits](https://developers.cloudflare.com/containers/platform-details/limits/)
