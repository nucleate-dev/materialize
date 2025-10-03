import { GlideClient } from '@valkey/valkey-glide';
import * as dotenv from 'dotenv';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type APIResponse,
  type DispatchPrecheckErrorResponse,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckSuccessResponse,
  type DispatchRequestBody,
  type DispatchSuccessResponse,
  type RestartDevServerRequestBody,
  type RestartDevServerSuccessResponse,
  type RunCommandRequestBody,
  type RunCommandSuccessResponse,
  type StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { IdleContainerAllocationSystemService } from './IdleContainerAllocationSystemService.js';
import { handleDispatchImpl } from './handleDispatch.js';
import { handleDispatchEditIntentImpl } from './handleDispatchEditIntent.js';
import { handleDispatchPrecheckImpl } from './handleDispatchPrecheck.js';
import { handleRunCommandImpl } from './handleDispatchRunCommand.js';
import { handleRestartDevServerImpl } from './handleDispatchRestartServer.js';

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
    request.log2 = request.log2.child({
      function: 'handleRestartDevServer',
    });
    return handleRestartDevServerImpl(request, reply, this.cache);
  }

  private async handleRunCommand(
    request: FastifyRequest<{
      Body: RunCommandRequestBody;
    }>,
    reply: FastifyReply,
  ): Promise<APIResponse<RunCommandSuccessResponse, StandardErrorResponse>> {
    request.log2 = request.log2.child({
      function: 'handleRunCommand',
    });
    return handleRunCommandImpl(request, reply, this.cache);
  }

  // Route handlers
  private async handleDispatch(
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
    request.log2 = request.log2.child({
      function: 'handleDispatch',
    });
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
    request.log2 = request.log2.child({
      function: 'handleDispatchEditIntent',
    });
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
    request.log2 = request.log2.child({
      function: 'handleDispatchPrecheck',
    });
    return handleDispatchPrecheckImpl(request, reply, this.cache);
  }
}
