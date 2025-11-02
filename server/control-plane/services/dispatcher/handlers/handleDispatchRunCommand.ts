import {
  BuildStatus,
  APIResponse,
  StandardErrorResponse,
} from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { CACHE_KEYS, isActiveBuildType } from '../../../types/InternalTypes.js';
import { GlideClient } from '@valkey/valkey-glide';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
  hgetallAsDevBuild,
} from '../../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import axios from 'axios';
import {
  PublicRunCommandRequest,
  PublicRunCommandResponse,
} from '../../../types/BuildWorkerTypes.js';

export async function handleRunCommandImpl(
  body: PublicRunCommandRequest & { prototype_id: string },
  jwt: string,
  cache: GlideClient,
  log2: SystemLogger,
): Promise<APIResponse<PublicRunCommandResponse, StandardErrorResponse>> {
  const {
    prototype_id,
    command,
    args,
    cwd,
    env,
    timeout_ms,
    strip_ansi,
  } = body;

  // ------------------------------------------------------------------------------------------------
  // FOR DEVELOPMENT PURPOSES: if env is dev, fargate dev mode is enabled, and an ip is provided, skip
  // all auth & cache management logic and just dispatch to the provided ip directly
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.FARGATE_DEV_MODE === 'true' &&
    process.env.FARGATE_DEV_IP
  ) {
    const devKey = CACHE_KEYS.protoDev(prototype_id);
    const existingDevData = await hgetallAsDevBuild(cache, devKey);
    if (
      !existingDevData?.status ||
      !isEditableDevServer(existingDevData.status as BuildStatus)
    ) {
      return {
        data: null,
        error: {
          error: 'Conflict',
          message: 'There is no editable dev server for this prototype',
        },
      };
    }
    const response = await callFargateRunCommand(
      process.env.FARGATE_DEV_IP,
      {
        command,
        args,
        cwd,
        env,
        timeout_ms,
        strip_ansi: strip_ansi ?? true,
      },
      log2,
    );
    return {
      data: response,
      error: null,
    };
  }
  // ------------------------------------------------------------------------------------------------

  // 1. Authentication check
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    log2,
  );
  if (!authResult || !authResult.canEdit) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }

  log2 = log2.child({
    userId: authResult.user?.id || 'service-role',
    prototypeId: prototype_id,
  });

  try {
    // 3. Get current build ID
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    if (!currentBuildId) {
      return {
        data: null,
        error: {
          error: 'Not Found',
          message: 'No active dev server found for this prototype',
        },
      };
    }

    // 4. Get the active build data
    const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
    const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

    if (!existingBuild || !isActiveBuildType(existingBuild)) {
      return {
        data: null,
        error: {
          error: 'Not Found',
          message: 'Invalid or missing build data',
        },
      };
    }

    // 5. Check if dev server is in a runnable state
    if (!isEditableDevServer(existingBuild.status)) {
      return {
        data: null,
        error: {
          error: 'Conflict',
          message: `Cannot run command on dev server in ${existingBuild.status} state`,
        },
      };
    }

    // 6. Call run-command endpoint on the fargate instance
    const commandResponse = await callFargateRunCommand(
      existingBuild.fargate_private_ip,
      {
        command,
        args,
        cwd,
        env,
        timeout_ms,
        strip_ansi: strip_ansi ?? true,
      },
      log2,
    );

    // 7. Update last_touched timestamp
    const updatedBuildData = {
      ...existingBuild,
      last_touched: Math.floor(Date.now() / 1000),
    };

    await cache.hset(
      activeBuildKey,
      activeBuildToStringRecord(updatedBuildData),
    );

    // Return the command response wrapped in APIResponse format
    return {
      data: commandResponse,
      error: null,
    };
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    log2.error(error, 'Failed to run command on dev server');

    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
}

async function callFargateRunCommand(
  fargatePrivateIp: string,
  params: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeout_ms?: number;
    strip_ansi?: boolean;
  },
  log2: SystemLogger,
): Promise<PublicRunCommandResponse> {
  try {
    // Build request without session_id - we want each command to run in a new session
    const request: PublicRunCommandRequest = {
      command: params.command,
      args: params.args,
      cwd: params.cwd,
      env: params.env,
      timeout_ms: params.timeout_ms,
      strip_ansi: params.strip_ansi ?? true,
      // Do NOT include session_id - let it create a new temp session
    };

    const response = await axios.post<PublicRunCommandResponse>(
      `http://${fargatePrivateIp}:3002/run-command`,
      request,
      {
        timeout: params.timeout_ms || 120000,
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': log2.getTraceId(),
        },
      },
    );

    log2.info('Fargate run-command response:', { response: response.data });
    return response.data;
  } catch (error) {
    log2.error(error, 'Error calling fargate run-command endpoint');
    // Return a timeout response on error
    return {
      status: 'timeout',
      stdout: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
