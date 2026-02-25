import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { EC2Client } from "@aws-sdk/client-ec2";
import { ECSClient } from "@aws-sdk/client-ecs";
import { S3Client } from "@aws-sdk/client-s3";
import { STSClient } from "@aws-sdk/client-sts";
import cors from "@fastify/cors";
import "dotenv/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { PostHog } from "posthog-node";
import { InternalCacheManagementService } from "./internal-services/InternalCacheManagementService.js";
import { InternalCleanupServiceManagement } from "./internal-services/InternalCleanupServiceManagement.js";
import { InternalControlPlaneDevelopmentService } from "./internal-services/InternalControlPlaneDevelopmentService.js";
import { InternalProductionDeploymentService } from "./internal-services/InternalProductionDeploymentService.js";
import { PostHogLogger } from "./loggers/PostHogLogger.js";
import { genRequestIds, SystemLogger } from "./loggers/SystemLogger.js";
import { CleanupService } from "./services/cleanup/CleanupService.js";
import { DevelopmentServerService } from "./services/DevelopmentServerService.js";
import { GitHubIntegrationService } from "./services/connectors/github/GitHubIntegrationService.js";
import { SupabaseIntegrationService } from "./services/connectors/supabase/SupabaseIntegrationService.js";
import { ConvexIntegrationService } from "./services/connectors/convex/ConvexIntegrationService.js";
import { IdleContainerAllocationSystemService } from "./services/idle-container-allocation-system/IdleContainerAllocationSystemService.js";
import { LLMService } from "./services/llm/LLMService.js";
import { OrchestrationService } from "./services/orchestration/OrchestrationService.js";
import { PrototypeDeploymentService } from "./services/prototype-management/PrototypeDeploymentService.js";
import { PrototypeManagementService } from "./services/prototype-management/PrototypeManagementService.js";
import { StripeManagementService } from "./services/StripeManagementService.js";
import { TeamManagementService } from "./services/team-management/TeamManagementService.js";
import { FileOperationsService } from "./services/file-operations/FileOperationsService.js";
import { ApiKeyService } from "./services/api-keys/ApiKeyService.js";

// Extend FastifyRequest to include our custom loggers and raw body
declare module "fastify" {
  interface FastifyRequest {
    log2: SystemLogger;
    posthogLogger: PostHogLogger;
    rawBody?: string | Buffer;
  }
}

export const posthog = new PostHog(process.env.POSTHOG_KEY!, {
  host: process.env.POSTHOG_HOST!,
});

export const baseLogger = new SystemLogger({
  service: "control-plane",
  env: process.env.NODE_ENV || "development",
  metricNamespace: "Materialize/Service",
  redactKeys: ["authorization", "cookie", "x-api-key"],
  posthog,
});

export const posthogLogger = new PostHogLogger({
  posthog,
  context: {
    server: "control-plane",
    env: process.env.NODE_ENV || "development",
  },
});

// Initialize clients
const initializeClients = async (): Promise<{
  ecsClient: ECSClient;
  ec2Client: EC2Client;
  autoScalingClient: AutoScalingClient;
  s3Client: S3Client;
  stsClient: STSClient;
}> => {
  const ecsClient = new ECSClient({
    region: process.env.AWS_REGION!,
  });

  const ec2Client = new EC2Client({
    region: process.env.AWS_REGION!,
  });

  const autoScalingClient = new AutoScalingClient({
    region: process.env.AWS_REGION!,
  });

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-2",
  });
  const stsClient = new STSClient({ region: process.env.AWS_REGION });

  return {
    ecsClient,
    ec2Client,
    autoScalingClient,
    s3Client,
    stsClient,
  };
};

const fastify = Fastify({
  logger: true,
  disableRequestLogging: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-internal-signature",
    "x-internal-timestamp",
    "x-orchestration-token",
  ],
});

fastify.addHook("onRequest", async (req) => {
  const { requestId, traceId } = genRequestIds(
    req.headers as Record<string, string | string[] | undefined>,
  );
  req.log2 = baseLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
  });
  req.posthogLogger = posthogLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
  });
});

fastify.addHook("onClose", async () => {
  try {
    baseLogger.consoleLogDevOnly(
      "info",
      "Flushing PostHog events before shutdown...",
    );
    await posthog.shutdown();
    baseLogger.consoleLogDevOnly("info", "PostHog events flushed successfully");
  } catch (error) {
    fastify.log.error(error, "Failed to flush PostHog events during shutdown");
  }
});

let cleanupService: CleanupService;
let idleContainerAllocationSystemService: IdleContainerAllocationSystemService;
let stripeManagementService: StripeManagementService;
let teamManagementService: TeamManagementService;
let deploymentService: PrototypeDeploymentService;
let prototypeManagementService: PrototypeManagementService;
let developmentServerService: DevelopmentServerService;
let orchestrationService: OrchestrationService;
let githubIntegrationService: GitHubIntegrationService;
let supabaseIntegrationService: SupabaseIntegrationService;
let convexIntegrationService: ConvexIntegrationService;
let internalToolsService: InternalCacheManagementService;
let internalDevServerManagementService: InternalControlPlaneDevelopmentService;
let internalProductionDeploymentService: InternalProductionDeploymentService;
let internalCleanupServiceManagement: InternalCleanupServiceManagement;
let llmService: LLMService;
let fileOperationsService: FileOperationsService;
let apiKeyService: ApiKeyService;

// Health check
fastify.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).send({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Start server
const start = async (): Promise<void> => {
  try {
    // Initialize clients first
    const {
      ecsClient,
      ec2Client,
      autoScalingClient,
      s3Client,
      stsClient,
    } = await initializeClients();

    await fastify.register(rawBody, {
      field: "rawBody", // adds request.rawBody
      global: false, // only for routes that set config.rawBody = true
      encoding: "utf8",
      runFirst: true, // run before other preParsing hooks
      routes: ["/github/webhooks"],
    });

    // Create cleanup service with ECS client
    cleanupService = new CleanupService(ecsClient);

    // Create idle container allocation system service
    idleContainerAllocationSystemService =
      new IdleContainerAllocationSystemService({
        ecsClient: ecsClient,
        stsClient: stsClient,
        log2: baseLogger,
      });

    // Create stripe management service and register routes
    stripeManagementService = new StripeManagementService();
    stripeManagementService.registerRoutes(fastify);

    // Create team management service and register routes
    teamManagementService = new TeamManagementService();
    teamManagementService.registerRoutes(fastify);

    // Create deployment service and register routes
    deploymentService = new PrototypeDeploymentService(s3Client);
    deploymentService.registerRoutes(fastify);

    // Create prototype management service and register routes
    prototypeManagementService = new PrototypeManagementService(
      s3Client,
      cleanupService,
    );
    prototypeManagementService.registerRoutes(fastify);

    // Create development server service and register routes
    developmentServerService = new DevelopmentServerService(idleContainerAllocationSystemService);
    developmentServerService.registerRoutes(fastify);

    // Create orchestration service and register routes
    orchestrationService = new OrchestrationService(baseLogger);
    orchestrationService.registerRoutes(fastify);

    // Create GitHub integration service and register routes
    githubIntegrationService = new GitHubIntegrationService();
    githubIntegrationService.registerRoutes(fastify);

    // Create Supabase integration service and register routes
    supabaseIntegrationService = new SupabaseIntegrationService();
    supabaseIntegrationService.registerRoutes(fastify);

    // Create Convex integration service and register routes
    convexIntegrationService = new ConvexIntegrationService();
    convexIntegrationService.registerRoutes(fastify);

    // Create internal tools service and register routes
    internalToolsService = new InternalCacheManagementService();
    internalToolsService.registerRoutes(fastify);

    // Create internal dev server management service and register routes
    internalDevServerManagementService =
      new InternalControlPlaneDevelopmentService(ec2Client);
    internalDevServerManagementService.registerRoutes(fastify);

    // Create internal production deployment service and register routes
    internalProductionDeploymentService =
      new InternalProductionDeploymentService(
        ec2Client,
        autoScalingClient,
        idleContainerAllocationSystemService,
      );
    internalProductionDeploymentService.registerRoutes(fastify);

    // Create internal cleanup service management and register routes
    internalCleanupServiceManagement = new InternalCleanupServiceManagement(
      cleanupService,
    );
    internalCleanupServiceManagement.registerRoutes(fastify);

    // Create LLM service and register routes
    llmService = new LLMService();
    llmService.registerRoutes(fastify);

    // Create file operations service and register routes
    fileOperationsService = new FileOperationsService();
    fileOperationsService.registerRoutes(fastify);

    // Create API key service and register routes
    apiKeyService = new ApiKeyService();
    apiKeyService.registerRoutes(fastify);

    await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
    });
    fastify.log.info("Control plane server started successfully");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const close = async (): Promise<void> => {
  fastify.log.info("Shutting down...");
  try {
    // Stop cleanup services
    if (cleanupService) {
      cleanupService.stopCleanupServices();
    }
    // Stop idle container allocation system service
    if (idleContainerAllocationSystemService) {
      idleContainerAllocationSystemService.shutdown();
    }
    await fastify.close();
  } catch (error) {
    fastify.log.error(error, "Error during shutdown");
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

start();
