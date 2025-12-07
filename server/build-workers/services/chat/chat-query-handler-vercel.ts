import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { streamText, type LanguageModel } from "ai";
import path from "path";
import WebSocket from "ws";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { DevServerStatus } from "../../types/BuildWorkerTypes.js";
import {
  ChatContentBlock,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
} from "../../types/ChatTypes.js";
import { Database } from "../../types/supabase.js";
import { NucleateDevelopmentServerService } from "../dev-server/NucleateDevelopmentServerService.js";
import { FileSyncService } from "../FileSyncService.js";
import { SandboxService } from "../SandboxService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { TerminalService } from "../terminals/TerminalService.js";
import {
  costFunctionV3,
  CURRENT_COST_FUNCTION_NAME,
  VERCEL_MODEL_COSTS_USD,
} from "./cost-calculation.js";
import { hasRemainingCredits } from "./credit-checks.js";
import {
  DEFAULT_DESIGN_AGENT_MODELS,
  executeDesignAgent,
  persistDesignSpecToFiles,
  type DesignAgentProvider,
} from "./design-agent-service.js";
import { classifyDesignIntent } from "./design-intent-classifier.js";
import { createVercelDevTools } from "./mcp-dev-tools-vercel.js";
import { ALLOWED_MODELS, ChatProvider } from "./model-providers.js";
import { ToolPermissionService } from "./tool-permission-service.js";
import { trackApiUsageBuildWorker } from "./usage-tracking.js";

interface CodeSessionState {
  sessionId: string | null;
  prototypeChatSessionId: string | null;
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  abortController: AbortController | null;
  modifiedFilesThisQuery: Set<string>;
  designSystemId: string | null;
  designSystemRules: string | null;
}

interface QueryValidationResult {
  valid: boolean;
  errorMessage?: string;
  errorDetails?: string;
}

interface DesignSystemResult {
  systemPrompt: string;
  designSystemId: string | null;
  designSystemRules: string | null;
}

interface DesignAgentMetadata {
  scope: "app" | "screen" | "component" | "other" | "unknown";
  isMasterDesignSpec: boolean;
}

interface QueryExecutionContext {
  prototypeId: string;
  socket: WebSocket;
  data: ChatQueryData;
  sessionState: CodeSessionState;
  validAiChatSessionIds: Set<string>;
}

interface MessageHandlers {
  sendMessage: (socket: WebSocket, message: ChatServerMessage) => void;
  persistMessage: (
    role: "user" | "assistant" | "system",
    content: string,
    messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
    eventType?: string | null,
    eventData?: unknown,
    creditsUsed?: number | null,
    costFunction?: string | null,
    provider?: string | null,
    model?: string | null,
  ) => Promise<void>;
  uploadChatImages: (
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string }>,
  ) => Promise<
    Array<{ storage_path: string; media_type: string; file_size: number }>
  >;
  updatePersistenceClient?: (client: unknown) => void;
  notifyOrchestrationStartChat: (prototypeId: string) => Promise<void>;
  notifyOrchestrationEndChat: (prototypeId: string) => Promise<void>;
}

export class VercelChatQueryHandler {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly fileSyncService: FileSyncService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly sandboxService: SandboxService;
  private readonly devServerService: NucleateDevelopmentServerService;
  private readonly terminalService: TerminalService;
  private readonly enableDesignAgentOnFirstMessage: boolean;

  constructor(
    workDir: string,
    logger: SystemLogger,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    toolPermissionService: ToolPermissionService,
    sandboxService: SandboxService,
    devServerService: NucleateDevelopmentServerService,
    terminalService: TerminalService,
    enableDesignAgentOnFirstMessage: boolean,
  ) {
    this.workDir = workDir;
    this.logger = logger.child({ service: "VercelChatQueryHandler" });
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.toolPermissionService = toolPermissionService;
    this.sandboxService = sandboxService;
    this.devServerService = devServerService;
    this.terminalService = terminalService;
    this.enableDesignAgentOnFirstMessage = enableDesignAgentOnFirstMessage;
  }

  public async handleQuery(
    context: QueryExecutionContext,
    handlers: MessageHandlers,
  ): Promise<void> {
    const { prototypeId, socket, data, sessionState } = context;
    const { prompt, content, token, ai_chat_session_id, design_style } = data;
    const options = (data.options ?? {}) as Options & {
      provider?: ChatProvider;
      model?: string;
    };

    const model = options.model ?? ALLOWED_MODELS.vercel[0];

    this.logger.consoleLogDevOnly("info", "handleQuery (Vercel) params", {
      prototypeId,
      model,
      session_id: ai_chat_session_id,
      chat_session_id: data.prototype_chat_session_id,
    });

    const validation = this.validateQueryRequest(data);
    if (!validation.valid) {
      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: validation.errorMessage!,
          details: validation.errorDetails,
        },
      });
      return;
    }

    if (token) {
      const authResult = await this.authenticateWithToken(
        token,
        prototypeId,
        handlers,
      );
      if (!authResult.success) {
        handlers.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: authResult.errorMessage!,
            details: authResult.errorDetails,
          },
        });
        return;
      }
    }

    this.setupSessionState(data, sessionState);

    const designSystemResult = await this.loadDesignSystem(
      data.custom_design_system_id ?? null,
      sessionState,
      design_style,
      data.current_viewing_path,
      options,
    );

    const creditCheck = await this.performCreditCheck(prototypeId);
    if (!creditCheck.success) {
      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: creditCheck.errorMessage!,
          details: creditCheck.errorDetails,
        },
      });
      return;
    }

    let designSpec: string | null = null;
    let designMetadata: DesignAgentMetadata | null = null;
    let classifierCost: number | undefined = undefined;

    const canAttemptClassification =
      this.enableDesignAgentOnFirstMessage &&
      !!sessionState.prototypeChatSessionId;

    if (!canAttemptClassification) {
      this.logger.consoleLogDevOnly(
        "info",
        "Skipping design intent classification gate (Vercel handler)",
        {
          prototypeId,
          enableDesignAgentOnFirstMessage: this.enableDesignAgentOnFirstMessage,
          hasPrototypeChatSessionId: !!sessionState.prototypeChatSessionId,
        },
      );
    }

    if (canAttemptClassification) {
      const isFirst = await this.isFirstMessage(
        prototypeId,
        sessionState.prototypeChatSessionId ?? "",
      );

      if (isFirst) {
        this.logger.consoleLogDevOnly(
          "info",
          "Preparing to classify user intent (Vercel handler)",
          {
            prototypeId,
            enableDesignAgentOnFirstMessage:
              this.enableDesignAgentOnFirstMessage,
            hasSession: !!sessionState.prototypeChatSessionId,
            willClassify: true,
          },
        );

        const userMessageText =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text || "")
                  .join("\n")
              : prompt || "";

        if (userMessageText) {
          const classifierAbortController = new AbortController();
          sessionState.abortController = classifierAbortController;

          // Classify the user's intent
          this.logger.consoleLogDevOnly(
            "info",
            "Classifying user intent on first message (Vercel handler)",
            { prototypeId, userMessageLength: userMessageText.length },
          );

          const classificationResult = await classifyDesignIntent({
            userMessage: userMessageText,
            abortController: classifierAbortController,
            logger: this.logger,
            prototypeId,
          });

          classifierCost = classificationResult.costUsd;
          const shouldRunDesignAgent =
            classificationResult.intent === "full_app";

          this.logger.consoleLogDevOnly(
            "info",
            "User intent classified (Vercel handler)",
            {
              prototypeId,
              intent: classificationResult.intent,
              classifierCost,
            },
          );

          this.logger.consoleLogDevOnly(
            "info",
            "Design agent routing decision (Vercel handler)",
            {
              prototypeId,
              shouldRunDesignAgent,
              intent: classificationResult.intent,
            },
          );

          // Only run design agent if user wants a full app
          if (shouldRunDesignAgent) {
            handlers.sendMessage(socket, {
              type: ChatEvent.DESIGN_GENERATION,
              data: {
                status: "started",
                message: "Generating design specification...",
                runDesignAgent: true,
              },
            });

            this.logger.debug("Calling design agent (Vercel handler)", {
              prototypeId,
              userMessageLength: userMessageText.length,
              hasAbortController: !!classifierAbortController,
            });

            const designResult = await this.executeDesignAgentWrapper(
              prototypeId,
              userMessageText,
              classifierAbortController,
              "", // system prompt not used anymore (handled by design-agent-service)
            );

            this.logger.debug("Design agent returned (Vercel handler)", {
              prototypeId,
              hasDesignSpec: !!designResult.designSpec,
              designSpecLength: designResult.designSpec?.length,
              costUsd: designResult.costUsd,
            });

            if (designResult.designSpec) {
              const parsed = this.parseDesignAgentSpec(designResult.designSpec);
              designSpec = parsed.spec;
              designMetadata = parsed.metadata;

              // Write design spec to CLAUDE.md in the project directory
              // This allows the AI SDK to read it as project context
              await persistDesignSpecToFiles(
                this.workDir,
                designSpec,
                this.logger,
                prototypeId,
              );

              // Also store in database for backup/reference
              const { error: updateError } = await this.supabaseClientService
                .getClient()
                .from("prototypes")
                .update({ project_context: designSpec })
                .eq("id", prototypeId);

              if (updateError) {
                this.logger.error(
                  updateError,
                  "Failed to store design specification in project_context",
                  { prototypeId },
                );
              } else {
                this.logger.consoleLogDevOnly(
                  "info",
                  "Stored design specification in project_context database",
                  { prototypeId, specLength: designSpec.length },
                );
              }
            }
          } else {
            // User wants specific component - skip design agent
            this.logger.consoleLogDevOnly(
              "info",
              "Skipping design agent - user wants specific component (Vercel handler)",
              {
                prototypeId,
                intent: classificationResult.intent,
                classifierCost,
              },
            );
          }
        }
      }
    }

    // Design spec is now in CLAUDE.md - no need to append to system prompt
    const finalSystemPrompt = designSystemResult.systemPrompt;

    // Invalidate build before chat starts
    this.devServerService.developmentServerState.lastUpdatedTime = new Date();

    await handlers.notifyOrchestrationStartChat(prototypeId);

    try {
      const totalCostUsd = await this.executeVercelQuery(
        context,
        handlers,
        finalSystemPrompt,
        model,
        designSpec,
        designMetadata,
      );

      await this.syncAndTrackUsage(
        prototypeId,
        socket,
        sessionState,
        totalCostUsd,
        handlers.sendMessage,
      );
    } catch (error) {
      this.logger.error(error, "Vercel query failed");
      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "Failed to complete query",
          details: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      // Invalidate build after chat ends
      this.devServerService.developmentServerState.lastUpdatedTime = new Date();

      await handlers.notifyOrchestrationEndChat(prototypeId);
    }
  }

  private validateQueryRequest(data: ChatQueryData): QueryValidationResult {
    const { prompt, content } = data;
    if (!prompt && !content) {
      return { valid: false, errorMessage: "prompt or content is required" };
    }
    if (content && (!Array.isArray(content) || content.length === 0)) {
      return {
        valid: false,
        errorMessage: "content must be a non-empty array",
      };
    }
    return { valid: true };
  }

  private async authenticateWithToken(
    token: string,
    prototypeId: string,
    handlers: MessageHandlers,
  ): Promise<{
    success: boolean;
    errorMessage?: string;
    errorDetails?: string;
  }> {
    try {
      this.supabaseClientService.refreshClientWithToken(token);
      if (handlers.updatePersistenceClient) {
        handlers.updatePersistenceClient(
          this.supabaseClientService.getClient(),
        );
      }
      return { success: true };
    } catch (error) {
      this.logger.error(error, "Failed to refresh Supabase client", {
        prototypeId,
      });
      return {
        success: false,
        errorMessage: "Failed to authenticate with provided token",
        errorDetails: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private setupSessionState(
    data: ChatQueryData,
    sessionState: CodeSessionState,
  ): void {
    const { prototype_chat_session_id, ai_chat_session_id } = data;
    if (prototype_chat_session_id) {
      sessionState.prototypeChatSessionId = prototype_chat_session_id;
    } else {
      sessionState.prototypeChatSessionId = null;
    }

    if (ai_chat_session_id === null) {
      sessionState.sessionId = null;
    }
  }

  private async loadDesignSystem(
    custom_design_system_id: string | null,
    sessionState: CodeSessionState,
    design_style: string | undefined,
    current_viewing_path: string | undefined,
    options: Options,
  ): Promise<DesignSystemResult> {
    if (custom_design_system_id !== sessionState.designSystemId) {
      if (
        custom_design_system_id === null ||
        custom_design_system_id === undefined
      ) {
        sessionState.designSystemId = null;
        sessionState.designSystemRules = null;
      } else {
        try {
          const { data: designSystem, error } = await this.supabaseClientService
            .getClient()
            .from("design_systems")
            .select("*")
            .eq("id", custom_design_system_id)
            .single();

          if (error) {
            this.logger.error(error, "Failed to fetch design system", {
              designSystemId: custom_design_system_id,
            });
            sessionState.designSystemId = null;
            sessionState.designSystemRules = null;
          } else if (designSystem) {
            sessionState.designSystemId = custom_design_system_id;
            sessionState.designSystemRules = (
              designSystem as Database["public"]["Tables"]["design_systems"]["Row"]
            ).design_rules;
          } else {
            sessionState.designSystemId = null;
            sessionState.designSystemRules = null;
          }
        } catch (error) {
          this.logger.error(error, "Error fetching design system", {
            designSystemId: custom_design_system_id,
          });
          sessionState.designSystemId = null;
          sessionState.designSystemRules = null;
        }
      }
    }

    let systemPromptAppend = "You are a helpful coding assistant.";

    if (sessionState.designSystemRules) {
      systemPromptAppend +=
        "\n\n## Custom Design System Rules:\n" + sessionState.designSystemRules;
    }

    if (current_viewing_path) {
      systemPromptAppend += `\n\n## Current Viewing Context:\nThe user is currently viewing the route: ${current_viewing_path}`;
    }

    const historyContext = (options as Record<string, unknown>)
      ?.__historyContext as string | undefined;
    if (historyContext) {
      systemPromptAppend += historyContext;
    }

    return {
      systemPrompt: systemPromptAppend,
      designSystemId: sessionState.designSystemId,
      designSystemRules: sessionState.designSystemRules,
    };
  }

  private async performCreditCheck(prototypeId: string): Promise<{
    success: boolean;
    errorMessage?: string;
    errorDetails?: string;
  }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabaseClientService.getClient().auth.getUser();

      if (userError || !user) {
        return {
          success: false,
          errorMessage: "Authentication required",
          errorDetails: "Unable to verify user credentials",
        };
      }

      const creditCheck = await hasRemainingCredits(
        this.supabaseClientService.getClient(),
        user.id,
        this.logger,
      );

      if (!creditCheck.hasCredits) {
        return {
          success: false,
          errorMessage: "Credit limit exceeded",
          errorDetails: `You have used all ${creditCheck.granted} credits available. Please upgrade your plan to continue.`,
        };
      }

      return { success: true };
    } catch (error) {
      this.logger.error(error, "Error during credit check", { prototypeId });
      return {
        success: false,
        errorMessage: "Unable to verify credits",
        errorDetails: "An error occurred while checking your credit balance",
      };
    }
  }

  private async isFirstMessage(
    prototypeId: string,
    prototypeChatSessionId: string,
  ): Promise<boolean> {
    try {
      const { count: messageCount, error: messageError } =
        await this.supabaseClientService
          .getClient()
          .from("prototype_chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_session_id", prototypeChatSessionId);

      if (messageError) {
        return false;
      }

      if (messageCount && messageCount > 0) {
        return false;
      }

      const { count: sessionCount, error: sessionError } =
        await this.supabaseClientService
          .getClient()
          .from("prototype_chat_sessions")
          .select("*", { count: "exact", head: true })
          .eq("prototype_id", prototypeId);

      if (sessionError) {
        return false;
      }

      return sessionCount === 1;
    } catch (error) {
      this.logger.error(error, "Error during first message detection", {
        prototypeId,
        prototypeChatSessionId,
      });
      return false;
    }
  }

  /**
   * Executes the design agent to generate a comprehensive design specification
   * Uses AI SDK for flexible model support (Google, OpenAI)
   */
  private async executeDesignAgentWrapper(
    prototypeId: string,
    userMessage: string,
    abortController: AbortController,
    _systemPrompt: string,
  ): Promise<{ designSpec: string | null; costUsd: number | undefined }> {
    // Use Gemini by default for design agent (fast and free)
    const provider: DesignAgentProvider = "google";
    const model = DEFAULT_DESIGN_AGENT_MODELS[provider];

    this.logger.consoleLogDevOnly(
      "info",
      "Executing design agent via AI SDK (Vercel handler)",
      { prototypeId, provider, model, userMessageLength: userMessage.length },
    );

    return executeDesignAgent({
      provider,
      model,
      userMessage,
      workDir: this.workDir,
      abortController,
      logger: this.logger,
      prototypeId,
    });
  }

  private parseDesignAgentSpec(rawSpec: string): {
    spec: string;
    metadata: DesignAgentMetadata;
  } {
    const defaultMetadata: DesignAgentMetadata = {
      scope: "unknown",
      isMasterDesignSpec: false,
    };

    const metadataHeading = "### METADATA";
    const headingIndex = rawSpec.lastIndexOf(metadataHeading);

    if (headingIndex === -1) {
      return { spec: rawSpec.trim(), metadata: defaultMetadata };
    }

    const specWithoutMetadata = rawSpec.slice(0, headingIndex).trim();
    const metadataSection = rawSpec
      .slice(headingIndex + metadataHeading.length)
      .trim();

    const metadataLines = metadataSection
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const metadata: DesignAgentMetadata = { ...defaultMetadata };

    for (const line of metadataLines) {
      const [rawKey, ...rest] = line.split(":");
      if (!rawKey || rest.length === 0) {
        continue;
      }
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim().toLowerCase();

      if (key === "scope") {
        if (value === "app") metadata.scope = "app";
        else if (value === "screen") metadata.scope = "screen";
        else if (value === "component") metadata.scope = "component";
        else if (value === "other") metadata.scope = "other";
      } else if (key === "ismasterdesignspec") {
        metadata.isMasterDesignSpec = value === "true";
      }
    }

    return { spec: specWithoutMetadata, metadata };
  }

  private async executeVercelQuery(
    context: QueryExecutionContext,
    handlers: MessageHandlers,
    systemPromptAppend: string,
    model: string,
    designSpec?: string | null,
    designMetadata?: DesignAgentMetadata | null,
  ): Promise<number | undefined> {
    const { prototypeId, socket, data, sessionState } = context;
    const { prompt, content } = data;

    const abortController = new AbortController();
    sessionState.abortController = abortController;

    const messageContent = this.prepareMessageContent(
      prompt,
      content as ChatContentBlock[] | undefined,
    );

    const imagesFromContent = this.extractImagesFromContent(messageContent);
    const imageMetadata: Array<{
      storage_path: string;
      media_type: string;
      name?: string;
    }> = data.image_metadata || [];

    await this.persistUserMessage(
      messageContent,
      imagesFromContent,
      imageMetadata,
      handlers.persistMessage,
      model,
    );

    if (designSpec) {
      await handlers.persistMessage(
        "assistant",
        designSpec,
        "text",
        "design_generation",
        { prototypeId },
        undefined,
        CURRENT_COST_FUNCTION_NAME,
        "vercel",
        model,
      );

      const metadata: DesignAgentMetadata =
        designMetadata ??
        ({
          scope: "unknown",
          isMasterDesignSpec: false,
        } as DesignAgentMetadata);
      const isAppLevel = metadata.scope === "app";
      const isNarrowBuild =
        metadata.scope === "screen" || metadata.scope === "component";

      handlers.sendMessage(socket, {
        type: ChatEvent.DESIGN_GENERATION,
        data: {
          status: "completed",
          message: "Design specification generated",
          designSpec: designSpec,
          runDesignAgent: true,
          isAppLevel,
          isNarrowBuild,
          persistToProjectContext: true,
          isMasterDesignSpec: metadata.isMasterDesignSpec,
          scope: metadata.scope,
        },
      });
    }

    const tools = createVercelDevTools(
      async (command: string, args: string[]) => {
        return this.executeSandboxCommand(command, args);
      },
      async (filePath: string, content: string) => {
        const result = await this.handleMcpWriteFile(
          filePath,
          content,
          sessionState,
        );
        return result;
      },
      this.terminalService,
      async () => {
        this.logger.consoleLogDevOnly(
          "info",
          "MCP restartDevServer tool: restarting dev server",
        );
        this.devServerService.developmentServerState.devServerStatus =
          DevServerStatus.RESTARTING;
        await this.devServerService.developmentServerAdapter.restartDevServer(
          this.logger,
        );
        this.devServerService.developmentServerState.devServerStatus =
          DevServerStatus.RUNNING;
      },
    );

    const modelInstance = this.resolveModel(model);

    const result = await streamText({
      model: modelInstance,
      system: systemPromptAppend,
      messages: [
        {
          role: "user",
          content: this.toAiContentParts(messageContent),
        },
      ],
      tools,
      abortSignal: abortController.signal,
      onStepFinish: async (event) => {
        if (event.toolCalls && event.toolCalls.length > 0) {
          for (const call of event.toolCalls) {
            handlers.sendMessage(socket, {
              type: ChatEvent.TOOL_COMPLETE,
              data: {
                tool_name: call.toolName,
                tool_call_id: call.toolCallId,
              },
            });
          }
        }
      },
    });

    const assistantText = await result.text;
    await handlers.persistMessage(
      "assistant",
      assistantText,
      "text",
      null,
      { provider: "vercel", model },
      undefined,
      CURRENT_COST_FUNCTION_NAME,
      "vercel",
      model,
    );

    const totalUsage = await result.totalUsage.catch(() => undefined);
    const totalCostUsd = this.estimateCostUsd(model, totalUsage);

    handlers.sendMessage(socket, {
      type: ChatEvent.QUERY_COMPLETE,
      data: { sessionId: sessionState.sessionId },
    });

    return totalCostUsd;
  }

  private prepareMessageContent(
    prompt: string | undefined,
    content: ChatContentBlock[] | undefined,
  ): string | ChatContentBlock[] {
    if (content && content.length > 0) {
      return content.map((block) => {
        if (block.type === "text") {
          return { ...block, text: block.text ?? "" };
        }
        return block;
      });
    }
    return prompt ?? "";
  }

  private extractImagesFromContent(
    messageContent: string | ChatContentBlock[],
  ): Array<{ base64: string; mediaType: string }> {
    if (typeof messageContent === "string" || !Array.isArray(messageContent)) {
      return [];
    }
    return messageContent
      .filter(
        (block) =>
          block.type === "image" &&
          block.source?.data &&
          block.source?.media_type,
      )
      .map((block) => {
        const source = block.source!;
        return {
          base64: source.data!,
          mediaType: source.media_type!,
        };
      });
  }

  private async persistUserMessage(
    messageContent:
      | string
      | Array<{ type: string; text?: string; source?: unknown }>,
    imagesFromContent: Array<{ base64: string; mediaType: string }>,
    imageMetadata: Array<{
      storage_path: string;
      media_type: string;
      name?: string;
    }>,
    persistMessage: MessageHandlers["persistMessage"],
    model: string,
  ): Promise<void> {
    const userMessageText =
      typeof messageContent === "string"
        ? messageContent
        : messageContent
            .filter((block) => block.type === "text")
            .map((block) => block.text || "")
            .join("\n");

    await persistMessage(
      "user",
      userMessageText,
      "text",
      null,
      { imagesFromContent, imageMetadata },
      null,
      CURRENT_COST_FUNCTION_NAME,
      "vercel",
      model,
    );
  }

  private toAiContentParts(
    messageContent: string | ChatContentBlock[],
  ): Array<{ type: "text"; text: string }> {
    if (typeof messageContent === "string") {
      return [{ type: "text", text: messageContent }];
    }
    return messageContent.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text || "" };
      }
      return { type: "text", text: "(image omitted in Vercel flow)" };
    });
  }

  private resolveModel(model: string): LanguageModel {
    if (model.startsWith("gpt")) {
      return openai(model);
    }
    return google(model);
  }

  private estimateCostUsd(
    model: string,
    usage:
      | {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        }
      | undefined,
  ): number | undefined {
    if (!usage) return undefined;
    const pricing = VERCEL_MODEL_COSTS_USD[model];
    if (!pricing) return undefined;

    const promptTokens = usage.promptTokens ?? usage.totalTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;

    const inputCost = pricing.inputUsdPer1M
      ? (promptTokens * pricing.inputUsdPer1M) / 1_000_000
      : 0;
    const outputCost = pricing.outputUsdPer1M
      ? (completionTokens * pricing.outputUsdPer1M) / 1_000_000
      : 0;

    const total = inputCost + outputCost;
    return total > 0 ? total : undefined;
  }

  private async executeSandboxCommand(
    command: string,
    args: string[],
  ): Promise<{ stdout: string; isError: boolean }> {
    const permission = this.toolPermissionService.evaluateToolPermission(
      "Bash",
      {
        command,
        args,
      },
    );
    if (permission.behavior === "deny") {
      return { stdout: permission.message ?? "Command denied", isError: true };
    }

    try {
      const { response: responseRaw } =
        await this.sandboxService.runCommandInternal({
          command,
          args,
          cwd: this.workDir,
          session_id: "test",
          timeout_ms: 30000,
          strip_ansi: true,
        });
      const response = responseRaw.data;
      if (!response) {
        this.logger.error(JSON.stringify(responseRaw));
        throw new Error("No response from sandbox service");
      }

      if (response.status === "success") {
        return {
          stdout: response.stdout || "Command executed successfully",
          isError: false,
        };
      }
      if (response.status === "timeout") {
        return {
          stdout: response.stdout || "Command timed out",
          isError: true,
        };
      }
      return { stdout: response.stdout || "Unknown error", isError: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(error, "Sandbox command failed (Vercel tools)");
      return { stdout: `System Error: ${errorMsg}`, isError: true };
    }
  }

  private async handleMcpWriteFile(
    filePath: string,
    content: string,
    sessionState: CodeSessionState,
  ): Promise<{ success: boolean; bytesWritten?: number; error?: string }> {
    const permission = this.toolPermissionService.evaluateToolPermission(
      "Write",
      {
        file_path: filePath,
      },
    );
    if (permission.behavior === "deny") {
      return { success: false, error: permission.message ?? "Write denied" };
    }

    try {
      const resolvedPath = path.resolve(this.workDir, filePath);
      const relativePath = path.relative(
        this.workDir,
        path.dirname(resolvedPath),
      );
      const filename = path.basename(resolvedPath);

      const result = await this.sandboxService.writeFile(
        relativePath,
        filename,
        content,
      );

      if (result.success) {
        sessionState.modifiedFilesThisQuery.add(
          path.join(relativePath, filename),
        );
        return { success: true, bytesWritten: content.length };
      }

      return { success: false, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async syncAndTrackUsage(
    prototypeId: string,
    socket: WebSocket,
    sessionState: CodeSessionState,
    totalCostUsd: number | undefined,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
  ): Promise<void> {
    try {
      const syncResult = await this.fileSyncService.syncFilesToSupabase(
        prototypeId,
        "tracked",
      );

      if (!syncResult.success) {
        this.logger.error(
          new Error("File sync completed with errors"),
          "File sync had errors",
          { prototypeId, errorCount: syncResult.errors.length },
        );
      }
    } catch (syncError) {
      this.logger.error(syncError, "Failed to sync files to Supabase", {
        prototypeId,
      });
    }

    const modifiedFiles = Array.from(sessionState.modifiedFilesThisQuery);
    if (modifiedFiles.length > 0) {
      try {
        sendMessage(socket, {
          type: ChatEvent.MODIFIED_FILES,
          data: { files: modifiedFiles },
        });
      } catch (modifiedFilesError) {
        this.logger.error(modifiedFilesError, "Failed to send modified files", {
          prototypeId,
        });
      }
    }
    sessionState.modifiedFilesThisQuery.clear();

    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabaseClientService.getClient().auth.getUser();

      if (userError || !user) {
        this.logger.warn("Unable to track API usage - no authenticated user", {
          prototypeId,
          error: userError,
        });
      } else {
        const creditsUsed = costFunctionV3(totalCostUsd) ?? 1.0;

        const { totalRemainingCredits } = await trackApiUsageBuildWorker(
          this.supabaseClientService.getClient(),
          user.id,
          prototypeId,
          this.logger,
          creditsUsed,
        );

        sendMessage(socket, {
          type: ChatEvent.USAGE_UPDATE,
          data: {
            creditsUsed,
            creditsRemaining: totalRemainingCredits,
          },
        });
      }
    } catch (error) {
      this.logger.error(error, "Failed to track usage for Vercel provider", {
        prototypeId,
      });
    }
  }
}
