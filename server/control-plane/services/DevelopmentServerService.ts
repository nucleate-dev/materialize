import axios from 'axios';
import { randomBytes } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LatencyEvents } from '../loggers/LatencyEvents.js';
import { PostHogEvents } from '../loggers/PostHogEvents.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import {
  StandardErrorResponse as BuildWorkerStandardErrorResponse,
  PublicAllocateSuccessResponse,
  PublicDevServerStartSuccessResponse,
  PublicStartDevServerRequest,
  SandboxAPIResponse,
} from '../types/BuildWorkerTypes.js';
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  FargateInstanceInfo,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../types/InternalTypes.js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  APIResponse,
  BuildStatus,
  DispatchSuccessResponse,
  StandardErrorResponse,
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
} from '../types/PublicAPITypes.js';
import {
  createNewBuild,
  getCurrentBuildForPrototype,
  getActiveBuild,
  removeBuildDataFromCache,
  updateBuildFields,
  getDevBuild,
  upsertDevBuild,
} from '../utils/cacheInteractionUtils.js';
import { handleDispatchPrecheckImpl } from '../utils/dispatchPrecheckUtils.js';
import { checkUserHasPrototypeEditAccess, validateJWTToken } from '../utils/prototypeAuth.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
  isEditableDevServer,
} from '../utils/prototypeDevServerStatusUtils.js';
import { hasExceededCreditLimit } from '../utils/subscriptionChecks.js';
import { IdleContainerAllocationSystemService } from './idle-container-allocation-system/IdleContainerAllocationSystemService.js';

export class DevelopmentServerService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;

  constructor(idleContainerAllocationSystem: IdleContainerAllocationSystemService) {
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;

    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        'Missing required Supabase environment variables for DevelopmentServerService',
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /files/start-dev-server
    app.post<{
      Body: StartDevServerRequestBody;
    }>(
      '/files/start-dev-server',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleStartDevServer.bind(this),
    );
  }

  private async handleStartDevServer(
    request: FastifyRequest<{ Body: StartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<StartDevServerSuccessResponse, StandardErrorResponse>
  > {
    try {
      const { prototype_id } = request.body;

      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Starting start dev server',
        {
          prototypeId: prototype_id,
        },
      );

      // 1. Authenticate JWT and get user info
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return {
          data: null,
          error: {
            error: 'Unauthorized',
            message: 'No token provided',
          },
        };
      }
      const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
      );
      if (
        authResponse === null ||
        authResponse.user === null ||
        !authResponse.canEdit
      ) {
        reply.status(HTTP_STATUS.UNAUTHORIZED);
        return {
          data: null,
          error: {
            error: 'Unauthorized',
            message: 'Access denied for this prototype',
          },
        };
      }

      // 2. Paywall check this user
      const exceededUsageLimit = await hasExceededCreditLimit(
        token,
        authResponse.user.id,
        request.log2,
        authResponse.prototype.team_id,
      );
      if (exceededUsageLimit.exceeded) {
        reply.status(HTTP_STATUS.PAYMENT_REQUIRED);
        return {
          data: null,
          error: {
            error: 'Payment required',
            message:
              'You have reached your monthly usage limit. Please upgrade to a paid plan to continue.',
          },
        };
      }

      // 3. Perform dispatch precheck to verify permissions and build status
      const precheckResult = await handleDispatchPrecheckImpl(
        { prototype_id },
        token,
        request.log2,
      );
      if (precheckResult.error) {
        request.log2.consoleLogDevOnly(
          'error',
          '[handleStartDevServer] Dispatch precheck failed:',
          { precheckResponse: precheckResult },
        );
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return precheckResult;
      }
      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatch precheck response:',
        { precheckResult },
      );

      // 3. Check if dev server already exists
      if (isEditableDevServer(precheckResult.data.status)) {
        request.log2.consoleLogDevOnly(
          'info',
          "[handleStartDevServer] There's already an active dev server for this prototype",
        );
        reply.status(HTTP_STATUS.CONFLICT);
        return {
          data: null,
          error: {
            error: 'Active dev server already exists',
            message:
              'A dev server is currently starting for this prototype. Please wait for it to complete.',
          },
        };
      }

      // 6. Dispatch dev server start request
      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatching dev server start request to server',
      );
      const localLog = request.log2.child({
        function: 'dispatch',
      });
      const posthogLogger = request.posthogLogger.child({
        function: 'dispatch',
        service: 'DevelopmentServerService',
        prototype_id,
      });
      const dispatchResult = await posthogLogger.timeAndRecord(
        authResponse.user.id,
        PostHogEvents.server_dispatch,
        () =>
          handleDispatchImpl(
            prototype_id,
            token,
            this.idleContainerAllocationSystem,
            localLog,
          ),
      );
      if (dispatchResult.error) {
        request.log2.error(
          dispatchResult.error,
          '[handleStartDevServer] Dispatch request failed:',
        );
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return dispatchResult;
      }

      request.log2.consoleLogDevOnly(
        'info',
        '[handleStartDevServer] Dispatch endpoint response:',
        { dispatchResult },
      );

      // 7. Return success response with viewing URL
      if (dispatchResult.data) {
        reply.status(HTTP_STATUS.OK);
        return {
          data: {
            success: true,
            status: 'success',
            viewing_url: dispatchResult.data.viewing_url,
            message: 'Files saved and dev server started successfully',
            terminal_url: dispatchResult.data.terminal_url,
          },
          error: null,
        };
      } else {
        // Handle error response
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: 'Dev server start failed',
            message: 'Dev server start failed',
          },
        };
      }
    } catch (error) {
      request.log2.consoleLogDevOnly(
        'error',
        '[handleStartDevServer] Start dev server API error:',
        { error },
      );
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Private dispatch utilities (moved from dispatcher/handlers/handleDispatch.ts)
// ---------------------------------------------------------------------------

async function handleDispatchImpl(
  prototype_id: string,
  jwt: string,
  idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  log2: SystemLogger,
): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
  // ------------------------------------------------------------------------------------------------
  // FOR DEVELOPMENT PURPOSES: if env is dev, fargate dev mode is enabled, and an ip is provided, skip
  // all auth & cache management logic and just dispatch to the provided ip directly
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.FARGATE_DEV_MODE === 'true' &&
    process.env.FARGATE_DEV_IP
  ) {
    return await handleDispatchForSandboxSimulatorFlow(
      prototype_id,
      jwt,
      log2,
    );
  }
  // ------------------------------------------------------------------------------------------------

  // 2. Authenticate
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    log2,
  );
  if (authResult === null || authResult.user === null || !authResult.canEdit) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }
  // update logger context
  log2 = log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    const currentTime = Math.floor(Date.now() / 1000);

    // Check if there's an existing current build
    const currentBuildResult =
      await getCurrentBuildForPrototype(prototype_id);

    let shouldCreateNewBuild = true;
    let currentBuildId: string | null = null;
    if (currentBuildResult) {
      currentBuildId = currentBuildResult.buildId;
      const existingBuild = currentBuildResult.build;

      log2.consoleLogDevOnly('info', 'Current build ID found: ', {
        currentBuildId,
      });

      if (!isActiveBuildType(existingBuild)) {
        return {
          data: null,
          error: {
            error: 'Internal Server Error',
            message: 'Invalid build data in cache',
          },
        };
      }

      // If build is cleaning or building, proceed with new build
      if (isDevServerInShutdownStages(existingBuild.status)) {
        log2.consoleLogDevOnly(
          'info',
          `Existing devserver ${currentBuildId} is cleaning or building, creating new devserver`,
        );
        shouldCreateNewBuild = true;
      } else if (isDispatchInProgress(existingBuild.status)) {
        // If build is actively working, return error
        return {
          data: null,
          error: {
            error: 'Conflict',
            message:
              'There is already an active dispatch request for this prototype',
          },
        };
      } else {
        // Reuse existing stable build
        shouldCreateNewBuild = false;
      }
    }

    let buildId: string;
    let updatedBuildCacheData: ActiveBuild;
    if (shouldCreateNewBuild) {
      log2.consoleLogDevOnly('info', 'Creating new build');
      const newBuildCacheData: ActiveBuild = {
        fargate_task_arn: '',
        fargate_private_ip: '',
        url: getS3Url(prototype_id),
        status: 'creating',
        last_touched: currentTime,
        terminal_tunnel_id: '',
        terminal_tunnel_hostname: '',
        orchestration_token: '',
        clean_attempts: 0,
      };
      buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const activeBuildKey = `active_build:${buildId}`;
      await createNewBuild(buildId, prototype_id, newBuildCacheData);

      let newFargateInstance: FargateInstanceInfo;
      try {
        newFargateInstance = await log2.time(
          LatencyEvents.launch_fargate_instance_latency,
          async (): Promise<FargateInstanceInfo> => {
            return await idleContainerAllocationSystem.allocateFargateDevServer(
              prototype_id,
              activeBuildKey,
              newBuildCacheData,
              jwt,
              authResult.user!.id,
            );
          },
        );
      } catch (error) {
        await removeBuildDataFromCache(
          log2,
          prototype_id,
          buildId,
        ); // remove build data from cache so it doesn't affect future builds
        log2.error(error, 'Failed to launch fargate instance for dispatcher');
        throw error;
      }
      updatedBuildCacheData = {
        ...newBuildCacheData,
        status: 'updating',
        fargate_task_arn: newFargateInstance.taskArn,
        fargate_private_ip: newFargateInstance.privateIp,
        terminal_tunnel_id: newFargateInstance.terminalTunnelId,
        terminal_tunnel_hostname: newFargateInstance.terminalTunnelHostname,
        orchestration_token: newFargateInstance.orchestrationToken,
      };
    } else {
      // Reuse existing build
      log2.consoleLogDevOnly('info', 'Reusing existing build');
      buildId = currentBuildId as string;
      const existingBuild = await getActiveBuild(buildId);
      if (!existingBuild || !isActiveBuildType(existingBuild)) {
        return {
          data: null,
          error: {
            error: 'Internal Server Error',
            message: 'Invalid build data in cache',
          },
        };
      }
      updatedBuildCacheData = {
        ...existingBuild,
        status: 'updating',
        last_touched: currentTime,
      };
    }
    await updateBuildFields(buildId, updatedBuildCacheData);
    // NOTE: at this point, there should always be an active build, with status "updating"

    // Dispatch request to fargate instance
    try {
      const fargateResponse = await dispatchRequestToFargateInstanceServer({
        prototype_id,
        log2,
        fargate_private_ip: updatedBuildCacheData.fargate_private_ip,
        jwt,
      });
      if (fargateResponse.data) {
        updatedBuildCacheData.status = 'stable';
        updatedBuildCacheData.url =
          fargateResponse.data.tunnel_url || getS3Url(prototype_id);
        updatedBuildCacheData.last_touched = Math.floor(Date.now() / 1000);
        await updateBuildFields(buildId, {
          status: updatedBuildCacheData.status,
          url: updatedBuildCacheData.url,
          last_touched: updatedBuildCacheData.last_touched,
        });
        log2.consoleLogDevOnly('info', 'Updated build cache data: ', {
          activeBuildCacheData: updatedBuildCacheData,
        });

        return {
          data: {
            viewing_url: normalizeUrl(
              fargateResponse.data.tunnel_url || getS3Url(prototype_id),
            ),
            terminal_url:
              updatedBuildCacheData.terminal_tunnel_hostname || null,
          },
          error: null,
        };
      } else {
        log2.error(undefined, 'Dispatch request failed to Fargate instance', {
          fargateResponse,
        });
        return {
          data: null,
          error: {
            error: fargateResponse.error?.error || 'Dispatch Failed',
            message:
              fargateResponse.error?.message ||
              'Dispatch request failed to Fargate instance',
          },
        };
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      log2.error(
        error,
        'There was an error dispatching the request to the fargate instance',
      );
      updatedBuildCacheData.status = 'error';
      await updateBuildFields(buildId, {
        status: updatedBuildCacheData.status,
      });

      return {
        data: null,
        error: {
          error: 'Internal Server Error',
          message:
            'There was a server error building the prototype. ' + e.message,
        },
      };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    log2.error(error, 'Dispatch request failed');

    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
}

async function dispatchRequestToFargateInstanceServer({
  prototype_id,
  log2,
  fargate_private_ip,
  jwt,
}: {
  prototype_id: string;
  log2: SystemLogger;
  fargate_private_ip: string;
  jwt: string;
}): Promise<
  SandboxAPIResponse<
    PublicDevServerStartSuccessResponse,
    BuildWorkerStandardErrorResponse
  >
> {
  log2.consoleLogDevOnly(
    'info',
    `Dispatching request to fargate instance at ${fargate_private_ip}:3002/dev-server/start-v2: `,
  );
  const fargateResponse = await log2.time(
    LatencyEvents.dispatch_request_to_fargate_server_latency,
    async (): Promise<
      SandboxAPIResponse<
        PublicDevServerStartSuccessResponse,
        BuildWorkerStandardErrorResponse
      >
    > => {
      return await dispatchFormedRequestToFargateInstanceServer(
        fargate_private_ip,
        { prototype_id },
        log2,
        jwt,
      );
    },
  );
  log2.consoleLogDevOnly('info', 'Fargate responded: ', { fargateResponse });
  return fargateResponse;
}

async function dispatchFormedRequestToFargateInstanceServer(
  fargatePrivateIp: string,
  requestBody: PublicStartDevServerRequest,
  log2: SystemLogger,
  jwt: string,
): Promise<
  SandboxAPIResponse<
    PublicDevServerStartSuccessResponse,
    BuildWorkerStandardErrorResponse
  >
> {
  try {
    const response = await axios.post<
      SandboxAPIResponse<
        PublicDevServerStartSuccessResponse,
        BuildWorkerStandardErrorResponse
      >
    >(`http://${fargatePrivateIp}:3002/dev-server/start-v2`, requestBody, {
      timeout: BUILD_TIMEOUTS.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'x-trace-id': log2.getTraceId(),
        Authorization: `Bearer ${jwt}`,
      },
    });
    return response.data;
  } catch (error) {
    log2.error(error, 'Error dispatching request to fargate instance: ');
    return {
      data: null,
      error: {
        error: 'Failed to dispatch request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

function getS3Url(prototypeId: string): string {
  // Construct S3/CloudFront URL for the prototype
  return S3_URL_TEMPLATE(prototypeId);
}

function normalizeUrl(url: string): string {
  // Ensure URL has protocol (https://) for iframe loading
  // If URL starts with exp://, replace it with https://
  if (url && url.startsWith('exp://')) {
    return url.replace('exp://', 'https://');
  }
  // Otherwise, if URL doesn't start with http, prepend https://
  return url && !url.startsWith('http') && !url.startsWith('wss')
    ? `https://${url}`
    : url;
}

async function handleDispatchForSandboxSimulatorFlow(
  prototype_id: string,
  jwt: string,
  log2: SystemLogger,
): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
  const existingDevData = await getDevBuild(prototype_id);

  if (
    existingDevData?.status &&
    isDispatchInProgress(existingDevData.status as BuildStatus)
  ) {
    return {
      data: null,
      error: {
        error: 'Conflict',
        message:
          'There is already an active dispatch request for this prototype',
      },
    };
  }

  const { user } = await validateJWTToken(jwt, log2);
  if (user === null) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }

  // Set initial status, url, and tunnel hostname
  const devTerminalUrl = `http://${process.env.DEVELOPMENT_EC2_IP}:3002`;
  const orchestration_token = randomBytes(32).toString('hex');
  await upsertDevBuild(prototype_id, {
    status: 'updating' as BuildStatus,
    url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
    terminal_tunnel_hostname: devTerminalUrl,
    orchestration_token,
  });

  try {
    const allocateResponse = await axios.post<
      SandboxAPIResponse<
        PublicAllocateSuccessResponse,
        BuildWorkerStandardErrorResponse
      >
    >(
      `http://${process.env.FARGATE_DEV_IP}:3002/allocate`,
      {
        s3_credentials: {
          accessKeyId: '',
          secretAccessKey: '',
          sessionToken: '',
          expiration: '',
        },
        user_details: {
          prototypeId: prototype_id,
          userId: user.id, // Placeholder for dev mode since auth is skipped
        },
        cloudflare_credentials: {
          cloudflare_tunnel_token: '',
          cloudflare_tunnel_hostname: `http://${process.env.DEVELOPMENT_EC2_IP}`,
          tunnel_mode: 'none',
        },
        keys: {
          orchestration_token,
          aak: process.env.ANTHROPIC_API_KEY,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
      },
    );

    if (allocateResponse.data.error) {
      log2.error(
        new Error(allocateResponse.data.error.error || 'Allocation failed'),
        'Failed to allocate worker in dev mode',
        { details: allocateResponse.data.error.details },
      );
      await upsertDevBuild(prototype_id, {
        status: 'error' as BuildStatus,
        url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
      });
      return {
        data: null,
        error: {
          error: 'Allocation Failed',
          message: `Failed to allocate worker: ${allocateResponse.data.error.message || 'Unknown error'}`,
        },
      };
    }
    log2.consoleLogDevOnly('info', 'Worker allocated successfully in dev mode');
  } catch (allocateError) {
    log2.error(allocateError, 'Failed to call /allocate in dev mode');
    await upsertDevBuild(prototype_id, {
      status: 'error' as BuildStatus,
      url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
    });
    return {
      data: null,
      error: {
        error: 'Allocation Failed',
        message:
          'Failed to allocate dev EC2 for build workers: ' +
          (allocateError instanceof Error
            ? allocateError.message
            : 'Unknown error'),
      },
    };
  }

  const fargateResponse = await dispatchRequestToFargateInstanceServer({
    prototype_id,
    log2,
    fargate_private_ip: process.env.FARGATE_DEV_IP!,
    jwt,
  });

  if (fargateResponse.data) {
    const newUrl = normalizeUrl(
      fargateResponse.data.tunnel_url || getS3Url(prototype_id),
    );
    await upsertDevBuild(prototype_id, {
      status: 'stable' as BuildStatus,
      url: newUrl,
    });
    return {
      data: {
        viewing_url: newUrl,
        terminal_url: devTerminalUrl,
      },
      error: null,
    };
  } else {
    await upsertDevBuild(prototype_id, {
      status: 'error' as BuildStatus,
      url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
    });
    return {
      data: null,
      error: {
        error: fargateResponse.error?.error || 'Build Failed',
        message:
          fargateResponse.error?.message ||
          'Build failed on development fargate instance',
      },
    };
  }
}
