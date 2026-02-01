import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    HTTP_STATUS,
    StandardErrorResponse,
    StartChatRequestBody,
    StartChatResponse,
} from "../../types/PublicAPITypes.js";
import { validateOrchestrationToken } from "./OrchestrationService.js";
import { GlideClient } from "@valkey/valkey-glide";
import { CACHE_KEYS } from "../../types/InternalTypes.js";
import {
    hgetallAsActiveBuild,
    hgetallAsDevBuild,
} from "../../utils/cacheInteractionUtils.js";
import { isDevServerInShutdownStages } from "../../utils/prototypeDevServerStatusUtils.js";

export async function handleStartChatImpl(
    request: FastifyRequest<{ Body: StartChatRequestBody }>,
    reply: FastifyReply,
    cache: GlideClient,
): Promise<APIResponse<StartChatResponse, StandardErrorResponse>> {
    const { prototype_id } = request.body;

    // Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
        cache,
    );

    if (!validation.isValid) {
        const statusCode = validation.errorMessage ===
                "No active build found for this prototype"
            ? HTTP_STATUS.NOT_FOUND
            : HTTP_STATUS.UNAUTHORIZED;

        const errorResponse: StandardErrorResponse = {
            error: statusCode === HTTP_STATUS.NOT_FOUND
                ? "NOT_FOUND"
                : "UNAUTHORIZED",
            message: validation.errorMessage!,
        };
        reply.status(statusCode);
        return {
            data: null,
            error: errorResponse,
        };
    }

    // Check if build is in shutdown stages (cleaning or building)
    let activeBuild;
    let activeBuildKey;
    if (
        process.env.NODE_ENV === "development" &&
        process.env.FARGATE_DEV_MODE === "true"
    ) {
        activeBuildKey = CACHE_KEYS.protoDev(prototype_id);
        activeBuild = await hgetallAsDevBuild(cache, activeBuildKey);
    } else {
        activeBuildKey = CACHE_KEYS.activeBuild(validation.buildId!);
        activeBuild = await hgetallAsActiveBuild(cache, activeBuildKey);
    }

    if (!activeBuild) {
        request.log2.error(
            new Error("Active build data not found in cache"),
            "Build metadata missing during start chat",
            { prototypeId: prototype_id, buildId: validation.buildId },
        );
        const errorResponse: StandardErrorResponse = {
            error: "INTERNAL_SERVER_ERROR",
            message: "Build metadata not found",
        };
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
            data: null,
            error: errorResponse,
        };
    }

    if (isDevServerInShutdownStages(activeBuild.status)) {
        request.log2.warn("Cannot start chat - build is in shutdown stage", {
            prototypeId: prototype_id,
            buildId: validation.buildId,
            currentStatus: activeBuild.status,
        });
        const errorResponse: StandardErrorResponse = {
            error: "CONFLICT",
            message:
                `Cannot start chat while sandbox is in cleanup stages ${activeBuild.status}. Please get a new dev-server.`,
        };
        reply.status(HTTP_STATUS.CONFLICT);
        return {
            data: null,
            error: errorResponse,
        };
    }

    // Update active build state in cache
    const currentTime = Math.floor(Date.now() / 1000);

    try {
        await cache.hset(activeBuildKey, {
            status: "chatting",
            last_touched: currentTime.toString(),
        });

        request.log2.consoleLogDevOnly(
            "info",
            "Updated build state to chatting",
            {
                prototypeId: prototype_id,
                buildId: validation.buildId,
                timestamp: currentTime,
            },
        );

        const successResponse: StartChatResponse = {
            success: true,
            message: "Chat session started, build state updated to chatting",
        };
        return reply.status(HTTP_STATUS.OK).send({
            data: successResponse,
            error: null,
        });
    } catch (error) {
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to update build state to chatting",
            { prototypeId: prototype_id, buildId: validation.buildId },
        );

        const errorResponse: StandardErrorResponse = {
            error: "INTERNAL_SERVER_ERROR",
            message: "Failed to update build state",
        };
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: errorResponse,
        });
    }
}
