import { GlideClient } from "@valkey/valkey-glide";
import axios from "axios";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructorConstructSuccessResponse,
  DesignSystemConstructorStatusSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse as BuildWorkerStandardErrorResponse,
  DesignSystemConstructionState,
} from "../../types/BuildWorkerTypes.js";
import {
  APIResponse,
  HTTP_STATUS,
  IsolatedAgenticWorkflowPurpose,
  StandardErrorResponse,
  TriggerIsolatedAgenticWorkflowRequestBody,
  TriggerIsolatedAgenticWorkflowSuccessResponse,
} from "../../types/PublicAPITypes.js";
import {
  ActiveIsolatedAgenticWorkflow,
  CACHE_KEYS,
} from "../../types/InternalTypes.js";
import {
  hgetallAsIsolatedAgenticWorkflow,
  isolatedAgenticWorkflowToStringRecord,
} from "../../utils/cacheInteractionUtils.js";
import { verifyJWT } from "../../utils/prototypeAuth.js";
import { IdleContainerAllocationSystemService } from "../idle-container-allocation-system/IdleContainerAllocationSystemService.js";

export class IsolatedAgenticWorkflowService {
  private cache: GlideClient;
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;

  constructor(
    cache: GlideClient,
    idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  ) {
    this.cache = cache;
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;
  }

  public registerRoutes(app: FastifyInstance): void {
    app.post<{ Body: TriggerIsolatedAgenticWorkflowRequestBody }>(
      "/isolated-agentic-workflows/trigger-workflow",
      {
        schema: {
          body: {
            type: "object",
            required: ["purpose", "data"],
            properties: {
              purpose: {
                type: "string",
                enum: ["design-system-construction"],
              },
              data: {
                type: "object",
                required: ["name", "description", "team_id", "github_id"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  team_id: { type: "string" },
                  github_id: { type: "string" },
                },
              },
            },
          },
        },
      },
      this.handleTriggerWorkflow.bind(this),
    );
  }

  private async handleTriggerWorkflow(
    request: FastifyRequest<{ Body: TriggerIsolatedAgenticWorkflowRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<TriggerIsolatedAgenticWorkflowSuccessResponse, StandardErrorResponse>
  > {
    const token = request.headers.authorization?.split(" ")[1];
    if (!token || !request.headers.authorization?.startsWith("Bearer")) {
      reply.status(HTTP_STATUS.UNAUTHORIZED);
      return {
        data: null,
        error: {
          error: "Unauthorized",
          message: "No token provided",
        },
      };
    }

    const user = await verifyJWT(token, request.log2);
    if (!user) {
      reply.status(HTTP_STATUS.UNAUTHORIZED);
      return {
        data: null,
        error: {
          error: "Unauthorized",
          message: "Invalid token",
        },
      };
    }

    const { purpose, data } = request.body;
    const cacheKey = CACHE_KEYS.isolatedAgenticWorkflow(purpose, user.id);
    const existingWorkflow = await hgetallAsIsolatedAgenticWorkflow(
      this.cache,
      cacheKey,
    );

    if (
      existingWorkflow &&
      ![
        DesignSystemConstructionState.COMPLETE,
        DesignSystemConstructionState.ERROR,
      ].includes(existingWorkflow.state)
    ) {
      reply.status(HTTP_STATUS.CONFLICT);
      return {
        data: null,
        error: {
          error: "Conflict",
          message:
            "An isolated agentic workflow is already running for this user.",
        },
      };
    }

    if (existingWorkflow) {
      await this.cache.del([cacheKey]);
    }

    let fargateInfo;
    try {
      fargateInfo =
        await this.idleContainerAllocationSystem.allocateFargateIsolatedAgenticWorkflow(
          purpose,
          data,
          token,
          user.id,
        );
    } catch (error) {
      request.log2.error(
        error,
        "[handleTriggerWorkflow] Failed to allocate isolated workflow container",
      );
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Internal Server Error",
          message: "Failed to allocate isolated workflow container",
        },
      };
    }

    const workflowRecord: ActiveIsolatedAgenticWorkflow = {
      fargate_task_arn: fargateInfo.taskArn,
      fargate_private_ip: fargateInfo.privateIp,
      state: DesignSystemConstructionState.IDLE,
      last_touched: Math.floor(Date.now() / 1000),
      purpose: purpose as IsolatedAgenticWorkflowPurpose,
      user_id: user.id,
      team_id: data.team_id,
      data,
    };

    await this.cache.hset(
      cacheKey,
      isolatedAgenticWorkflowToStringRecord(workflowRecord),
    );

    try {
      await this.triggerWorkflowOnWorker(
        fargateInfo.privateIp,
        purpose,
        token,
      );
      await this.cache.hset(cacheKey, {
        state: DesignSystemConstructionState.CONSTRUCTING,
        last_touched: Math.floor(Date.now() / 1000).toString(),
      });
      this.monitorWorkflowCompletion(
        fargateInfo.privateIp,
        purpose,
        token,
        cacheKey,
        request.log2,
      ).catch((error) => {
        request.log2.error(
          error,
          "[handleTriggerWorkflow] Failed to monitor isolated workflow completion",
        );
      });
    } catch (error) {
      await this.cache.hset(cacheKey, {
        state: DesignSystemConstructionState.ERROR,
        last_touched: Math.floor(Date.now() / 1000).toString(),
      });
      request.log2.error(
        error,
        "[handleTriggerWorkflow] Failed to trigger isolated workflow on worker",
      );
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Internal Server Error",
          message: "Failed to trigger isolated workflow",
        },
      };
    }

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        success: true,
        workflow_id: cacheKey,
      },
      error: null,
    };
  }

  private async monitorWorkflowCompletion(
    privateIp: string,
    purpose: IsolatedAgenticWorkflowPurpose,
    jwt: string,
    cacheKey: string,
    log2: FastifyRequest["log2"],
  ): Promise<void> {
    const maxAttempts = 60;
    const delayMs = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const state = await this.fetchWorkflowState(privateIp, purpose, jwt);
      if (
        state === DesignSystemConstructionState.COMPLETE ||
        state === DesignSystemConstructionState.ERROR
      ) {
        await this.cache.hset(cacheKey, {
          state,
          last_touched: Math.floor(Date.now() / 1000).toString(),
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    log2.warn(
      "[monitorWorkflowCompletion] Timed out waiting for workflow completion",
      { cacheKey, purpose },
    );
    await this.cache.hset(cacheKey, {
      state: DesignSystemConstructionState.ERROR,
      last_touched: Math.floor(Date.now() / 1000).toString(),
    });
  }

  private async fetchWorkflowState(
    privateIp: string,
    purpose: IsolatedAgenticWorkflowPurpose,
    jwt: string,
  ): Promise<DesignSystemConstructionState> {
    switch (purpose) {
      case "design-system-construction": {
        const response = await axios.post<
          SandboxAPIResponse<
            DesignSystemConstructorStatusSuccessResponse,
            BuildWorkerStandardErrorResponse
          >
        >(`http://${privateIp}:3002/design-system-constructor/status`, null, {
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
        });

        if (response.data.error) {
          throw new Error(
            response.data.error.message ||
              "Failed to fetch design system constructor status",
          );
        }

        return response.data.data.state;
      }
    }
  }

  private async triggerWorkflowOnWorker(
    privateIp: string,
    purpose: IsolatedAgenticWorkflowPurpose,
    jwt: string,
  ): Promise<void> {
    switch (purpose) {
      case "design-system-construction": {
        const response = await axios.post<
          SandboxAPIResponse<
            DesignSystemConstructorConstructSuccessResponse,
            BuildWorkerStandardErrorResponse
          >
        >(`http://${privateIp}:3002/design-system-constructor/construct`, null, {
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
        });

        if (response.data.error) {
          throw new Error(
            response.data.error.message ||
              "Failed to trigger design system construction",
          );
        }
        return;
      }
    }
  }
}
