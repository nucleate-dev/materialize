import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    BuildStatus,
    EndChatRequestBody,
    EndChatResponse,
    HTTP_STATUS,
    StandardErrorResponse,
} from "../../types/PublicAPITypes.js";
import {
    updateBuildStatus,
    upsertDevBuild,
} from "../../utils/cacheInteractionUtils.js";
import { validateOrchestrationToken } from "./OrchestrationTokenValidationUtils.js";

export async function handleEndChatImpl(
    request: FastifyRequest<{ Body: EndChatRequestBody }>,
    reply: FastifyReply,
): Promise<APIResponse<EndChatResponse, StandardErrorResponse>> {
    const { prototype_id } = request.body;

    // Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
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
        return reply.status(statusCode).send({
            data: null,
            error: errorResponse,
        });
    }

    // Update active build state in cache
    const isDevMode =
        process.env.NODE_ENV === "development" &&
        process.env.FARGATE_DEV_MODE === "true";
    const currentTime = Math.floor(Date.now() / 1000);

    try {
        if (isDevMode) {
            await upsertDevBuild(prototype_id, { status: "stable" as BuildStatus });
        } else {
            await updateBuildStatus(validation.buildId!, "stable", currentTime);
        }

        request.log2.consoleLogDevOnly(
            "info",
            "Updated build state to stable",
            {
                prototypeId: prototype_id,
                buildId: validation.buildId,
                timestamp: currentTime,
            },
        );

        const successResponse: EndChatResponse = {
            success: true,
            message: "Chat session ended, build state updated to stable",
        };
        return reply.status(HTTP_STATUS.OK).send({
            data: successResponse,
            error: null,
        });
    } catch (error) {
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to update build state to stable",
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
