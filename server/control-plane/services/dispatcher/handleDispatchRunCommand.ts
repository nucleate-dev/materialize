import { FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  HTTP_STATUS,
  RunCommandRequestBody,
  RunCommandSuccessResponse,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { CACHE_KEYS, isActiveBuildType } from '../../types/InternalTypes.js';
import { GlideClient } from '@valkey/valkey-glide';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import axios from 'axios';

export async function handleRunCommandImpl(
  request: FastifyRequest<{
    Body: RunCommandRequestBody;
  }>,
  reply: FastifyReply,
  cache: GlideClient,
): Promise<APIResponse<RunCommandSuccessResponse, StandardErrorResponse>> {
  const { prototype_id, command, args, cwd, env, timeout_ms } = request.body;

  // 1. Extract JWT from Authorization header
  const jwt = request.headers.authorization?.split(' ')[1];
  if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'No JWT token provided in Authorization header',
      },
    };
  }

  // 2. Authentication check
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    request.log2,
  );
  if (!authResult || !authResult.canEdit) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }

  request.log2 = request.log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    // 3. Get current build ID
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    if (!currentBuildId) {
      reply.status(HTTP_STATUS.NOT_FOUND);
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
      reply.status(HTTP_STATUS.NOT_FOUND);
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
      reply.status(HTTP_STATUS.CONFLICT);
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
      { command, args, cwd, env, timeout_ms },
      request.log2,
    );

    if (commandResponse.status === 'success') {
      // 7. Update last_touched timestamp
      const updatedBuildData = {
        ...existingBuild,
        last_touched: Math.floor(Date.now() / 1000),
      };

      await cache.hset(
        activeBuildKey,
        activeBuildToStringRecord(updatedBuildData),
      );

      reply.status(HTTP_STATUS.OK);
      return {
        data: {
          stdout: commandResponse.stdout ?? '',
          stderr: commandResponse.stderr ?? '',
          exit_code: commandResponse.exit_code ?? -1,
        } as RunCommandSuccessResponse,
        error: null,
      };
    } else {
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Command Execution Failed',
          message:
            commandResponse.error || 'Failed to run command on dev server',
        },
      };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    request.log2.error(error, 'Failed to run command on dev server');

    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
  },
  log2: SystemLogger,
): Promise<{
  status: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
}> {
  try {
    const response = await axios.post(
      `http://${fargatePrivateIp}:3002/run-command`,
      params,
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
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
