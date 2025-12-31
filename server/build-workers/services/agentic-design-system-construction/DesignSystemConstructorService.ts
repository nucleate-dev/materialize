import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructionState,
  DesignSystemConstructorAllocateSuccessResponse,
  DesignSystemConstructorConstructSuccessResponse,
  DesignSystemConstructorStatusSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../types/BuildWorkerTypes.js";
import { ClaudeAgentSDKConstructor } from "./ClaudeAgentSDKConstructor.js";
import { DesignSystemConstructorAgent } from "./DesignSystemConstructorAgent.js";
import { handleDesignSystemConstructorAllocate } from "./handlers/handleAllocate.js";
import { handleDesignSystemConstructorStatus } from "./handlers/handleStatus.js";
import { handleDesignSystemConstructorConstruct } from "./handlers/handleConstruct.js";

export class DesignSystemConstructorService {
  public readonly designSystemConstructorAgent: DesignSystemConstructorAgent;
  public readonly designSystemConstructionState: {
    state: DesignSystemConstructionState;
  };

  constructor() {
    this.designSystemConstructorAgent = new ClaudeAgentSDKConstructor();
    this.designSystemConstructionState = {
      state: DesignSystemConstructionState.IDLE,
    };
  }

  public registerRoutes(app: FastifyInstance): void {
    app.post(
      "/design-system-constructor/allocate",
      this.allocate.bind(this),
    );
    app.post(
      "/design-system-constructor/status",
      this.status.bind(this),
    );
    app.post(
      "/design-system-constructor/construct",
      this.construct.bind(this),
    );
  }

  private async allocate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      DesignSystemConstructorAllocateSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleDesignSystemConstructorAllocate(request, reply, this);
  }

  private async status(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      DesignSystemConstructorStatusSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleDesignSystemConstructorStatus(request, reply, this);
  }

  private async construct(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      DesignSystemConstructorConstructSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleDesignSystemConstructorConstruct(request, reply, this);
  }
}
