import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import * as dotenv from 'dotenv';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { CACHE_KEYS, isActiveBuildType } from '../../types/InternalTypes.js';
import {
  type APIResponse,
  type DispatchPrecheckErrorResponse,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckSuccessResponse,
  type DispatchRequestBody,
  type DispatchSuccessResponse,
  HTTP_STATUS,
  type RestartDevServerRequestBody,
  type RestartDevServerSuccessResponse,
  type RunCommandRequestBody,
  type RunCommandSuccessResponse,
  type StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';
import { IdleContainerAllocationSystemService } from './IdleContainerAllocationSystemService.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
} from '../../utils/cacheInteractionUtils.js';
import { handleDispatchImpl } from './handleDispatch.js';
import { handleDispatchEditIntentImpl } from './handleDispatchEditIntent.js';
import { handleDispatchPrecheckImpl } from './handleDispatchPrecheck.js';
import { handleRunCommandImpl } from './handleDispatchRunCommand.js';

dotenv.config();

export class DispatcherService {
  private cache: GlideClient;
  private fastifyApp: FastifyInstance;
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;

  constructor(
    cache: GlideClient,
    fastifyApp: FastifyInstance,
    idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  ) {
    this.cache = cache;
    this.fastifyApp = fastifyApp;
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    this.fastifyApp = app;
    // POST /dispatch
    app.post<{ Body: DispatchRequestBody }>(
      '/dispatch',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'files', 'assets', 'file_scope'],
            properties: {
              prototype_id: { type: 'string' },
              framework: {
                type: 'string',
                enum: ['expo_react_native', 'react'],
              },
              files: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['contents', 'name', 'prototype_id'],
                  properties: {
                    id: { type: 'string' },
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              assets: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['name', 'storage_url', 'prototype_id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    storage_url: { type: 'string' },
                    prototype_id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                    contents: { type: 'string' },
                  },
                },
              },
              file_scope: {
                type: 'string',
                enum: ['updates', 'complete'],
              },
              hot_reload: { type: 'boolean' },
            },
          },
        },
      },
      this.handleDispatch.bind(this),
    );

    // POST /dispatch-precheck
    app.post<{ Body: DispatchPrecheckRequestBody }>(
      '/dispatch-precheck',
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
      this.handleDispatchPrecheck.bind(this),
    );

    // POST /dispatch-edit-intent
    app.post<{ Body: DispatchPrecheckRequestBody }>(
      '/dispatch-edit-intent',
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
      this.handleDispatchEditIntent.bind(this),
    );

    // POST /dev-server/restart
    app.post<{ Body: RestartDevServerRequestBody }>(
      '/dev-server/restart',
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
      this.handleRestartDevServer.bind(this),
    );

    // POST /dev-server/run-command
    app.post<{
      Body: RunCommandRequestBody;
    }>(
      '/dev-server/run-command',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'command'],
            properties: {
              prototype_id: { type: 'string' },
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              cwd: { type: 'string' },
              env: { type: 'object' },
              timeout_ms: { type: 'number' },
            },
          },
        },
      },
      this.handleRunCommand.bind(this),
    );
  }

  private async handleRestartDevServer(
    request: FastifyRequest<{ Body: RestartDevServerRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<RestartDevServerSuccessResponse, StandardErrorResponse>
  > {
    const { prototype_id } = request.body;

    // 1. Extract JWT from Authorization header
    const jwt = request.headers.authorization?.split(' ')[1];
    if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'No JWT token provided in Authorization header',
        },
      });
    }

    // 2. Authentication check
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwt,
      request.log2,
    );
    if (!authResult || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message:
            'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
        },
      });
    }

    request.log2 = request.log2.child({
      userId: authResult.user.id,
      prototypeId: prototype_id,
    });

    try {
      // 3. Get current build ID
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      if (!currentBuildId) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'Not Found',
            message: 'No active dev server found for this prototype',
          },
        });
      }

      // 4. Get the active build data
      const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(
        this.cache,
        activeBuildKey,
      );

      if (!existingBuild || !isActiveBuildType(existingBuild)) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'Not Found',
            message: 'Invalid or missing build data',
          },
        });
      }

      // 5. Check if dev server is in a restartable state
      if (!isEditableDevServer(existingBuild.status)) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          data: null,
          error: {
            error: 'Conflict',
            message: `Cannot restart dev server in ${existingBuild.status} state`,
          },
        });
      }

      // 6. Call restart endpoint on the fargate instance
      const restartResponse = await this.callFargateRestart(
        existingBuild.fargate_private_ip,
        request.log2,
      );

      if (restartResponse.success) {
        // 7. Update last_touched timestamp
        const updatedBuildData = {
          ...existingBuild,
          last_touched: Math.floor(Date.now() / 1000),
        };

        await this.cache.hset(
          activeBuildKey,
          activeBuildToStringRecord(updatedBuildData),
        );

        return reply.status(HTTP_STATUS.OK).send({
          data: {
            message: 'Dev server restarted successfully',
          } as RestartDevServerSuccessResponse,
          error: null,
        });
      } else {
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'Internal Server Error',
            message: 'Failed to restart dev server',
          },
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to restart dev server');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: e.message,
        },
      });
    }
  }

  private async handleRunCommand(
    request: FastifyRequest<{
      Body: RunCommandRequestBody;
    }>,
    reply: FastifyReply,
  ): Promise<APIResponse<RunCommandSuccessResponse, StandardErrorResponse>> {
    return handleRunCommandImpl(request, reply, this.cache);
  }

  private async callFargateRestart(
    fargatePrivateIp: string,
    log2: SystemLogger,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.post(
        `http://${fargatePrivateIp}:3002/dev-server/restart`,
        {},
        {
          timeout: 90000, // 90 second timeout for restart
          headers: {
            'Content-Type': 'application/json',
            'x-trace-id': log2.getTraceId(),
          },
        },
      );

      log2.info('Fargate restart response:', { response: response.data });
      return { success: true };
    } catch (error) {
      log2.error(error, 'Error calling fargate restart endpoint');
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Route handlers
  private async handleDispatch(
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
    return handleDispatchImpl(
      request,
      reply,
      this.cache,
      this.idleContainerAllocationSystem,
    );
  }

  private async handleDispatchEditIntent(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
  > {
    return handleDispatchEditIntentImpl(
      request,
      reply,
      this.cache,
      this.fastifyApp,
    );
  }

  private async handleDispatchPrecheck(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
  > {
    return handleDispatchPrecheckImpl(request, reply, this.cache);
  }
}
