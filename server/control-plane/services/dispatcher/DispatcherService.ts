import { GlideClient } from '@valkey/valkey-glide';
import * as dotenv from 'dotenv';
import {
  type APIResponse,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckSuccessResponse,
  type DispatchRequestBody,
  type DispatchSuccessResponse,
  type RestartDevServerRequestBody,
  type RestartDevServerSuccessResponse,
  type StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { IdleContainerAllocationSystemService } from '../idle-container-allocation-system/IdleContainerAllocationSystemService.js';
import { handleDispatchImpl } from './handlers/handleDispatch.js';
import { handleDispatchChatEditIntentImpl } from './handlers/handleDispatchChatEditIntent.js';
import { handleDispatchPrecheckImpl } from './handlers/handleDispatchPrecheck.js';
import { handleRunCommandImpl } from './handlers/handleDispatchRunCommand.js';
import { handleRestartDevServerImpl } from './handlers/handleDispatchRestartServer.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import {
  PublicRunCommandRequest,
  PublicRunCommandSuccessResponse,
} from '../../types/BuildWorkerTypes.js';
import { PostHogLogger } from '../../loggers/PostHogLogger.js';
import { PostHogEvents } from '../../loggers/PostHogEvents.js';

dotenv.config();

export class DispatcherService {
  private cache: GlideClient;
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;
  private log2: SystemLogger;

  constructor(
    cache: GlideClient,
    idleContainerAllocationSystem: IdleContainerAllocationSystemService,
    log2: SystemLogger,
  ) {
    this.cache = cache;
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;
    this.log2 = log2.child({
      route: 'DispatcherService',
    });
  }

  // Public methods for internal service calls
  public async dispatch(
    body: DispatchRequestBody,
    jwt: string,
    log2: SystemLogger,
    posthogLogger: PostHogLogger,
    userId: string,
  ): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
    const localLog = log2.child({
      function: 'dispatch',
    });
    posthogLogger = posthogLogger.child({
      function: 'dispatch',
      service: 'DispatcherService',
      prototype_id: body.prototype_id,
    });
    return await posthogLogger.timeAndRecord(
      userId,
      PostHogEvents.dispatch,
      () =>
        handleDispatchImpl(
          body,
          jwt,
          this.cache,
          this.idleContainerAllocationSystem,
          localLog,
        ),
    );
  }

  public async dispatchPrecheck(
    body: DispatchPrecheckRequestBody,
    jwt: string,
    log2: SystemLogger,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, StandardErrorResponse>
  > {
    const localLog = log2.child({
      function: 'dispatchPrecheck',
    });
    return handleDispatchPrecheckImpl(body, jwt, this.cache, localLog);
  }

  public async dispatchChatEditIntent(
    body: DispatchPrecheckRequestBody,
    jwt: string,
    log2: SystemLogger,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, StandardErrorResponse>
  > {
    const localLog = log2.child({
      function: 'dispatchEditIntent',
    });
    return handleDispatchChatEditIntentImpl(body, jwt, this.cache, localLog);
  }

  public async restartDevServer(
    body: RestartDevServerRequestBody,
    jwt: string,
    log2: SystemLogger,
  ): Promise<
    APIResponse<RestartDevServerSuccessResponse, StandardErrorResponse>
  > {
    const localLog = log2.child({
      function: 'restartDevServer',
    });
    return handleRestartDevServerImpl(body, jwt, this.cache, localLog);
  }

  public async runCommand(
    body: PublicRunCommandRequest & { prototype_id: string },
    jwt: string,
    log2: SystemLogger,
  ): Promise<
    APIResponse<PublicRunCommandSuccessResponse, StandardErrorResponse>
  > {
    const localLog = log2.child({
      function: 'runCommand',
    });
    return handleRunCommandImpl(body, jwt, this.cache, localLog);
  }
}
