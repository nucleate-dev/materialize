import {
  type APIResponse,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckSuccessResponse,
  type DispatchSuccessResponse,
  type StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import { IdleContainerAllocationSystemService } from '../idle-container-allocation-system/IdleContainerAllocationSystemService.js';
import { handleDispatchImpl } from './handlers/handleDispatch.js';
import { handleDispatchPrecheckImpl } from './handlers/handleDispatchPrecheck.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { PostHogLogger } from '../../loggers/PostHogLogger.js';
import { PostHogEvents } from '../../loggers/PostHogEvents.js';

export class DispatcherService {
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;
  private log2: SystemLogger;

  constructor(
    idleContainerAllocationSystem: IdleContainerAllocationSystemService,
    log2: SystemLogger,
  ) {
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;
    this.log2 = log2.child({
      route: 'DispatcherService',
    });
  }

  // Public methods for internal service calls
  public async dispatch(
    prototype_id: string,
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
      prototype_id,
    });
    return await posthogLogger.timeAndRecord(
      userId,
      PostHogEvents.server_dispatch,
      () =>
        handleDispatchImpl(
          prototype_id,
          jwt,
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
    return handleDispatchPrecheckImpl(body, jwt, localLog);
  }
}
