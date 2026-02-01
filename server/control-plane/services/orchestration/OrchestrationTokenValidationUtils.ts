import { FastifyRequest } from "fastify";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { GlideClient } from "@valkey/valkey-glide";
import { CACHE_KEYS } from "../../types/InternalTypes.js";
import {
    hgetallAsActiveBuild,
    hgetallAsDevBuild,
} from "../../utils/cacheInteractionUtils.js";

/**
 * Validates the orchestration token from the request headers
 * @param request - The Fastify request object
 * @param prototypeId - The prototype ID to validate against
 * @returns The build ID if validation succeeds, null if it fails
 */
export async function validateOrchestrationToken(
    request: FastifyRequest,
    prototypeId: string,
    logger: SystemLogger,
    cache: GlideClient,
): Promise<{ isValid: boolean; buildId?: string; errorMessage?: string }> {
    // Extract token from x-orchestration-token header
    const providedToken = request.headers["x-orchestration-token"];

    if (!providedToken || typeof providedToken !== "string") {
        logger.warn("Missing orchestration token in request", {
            prototypeId,
        });
        return {
            isValid: false,
            errorMessage: "Missing x-orchestration-token header",
        };
    }

    if (
        process.env.NODE_ENV === "development" &&
        process.env.FARGATE_DEV_MODE === "true"
    ) {
        const devKey = CACHE_KEYS.protoDev(prototypeId);
        const existingDevData = await hgetallAsDevBuild(cache, devKey);
        if (existingDevData === null) {
            logger.warn(
                "[Development mode] No active build found for prototype",
                {
                    prototypeId,
                },
            );
            return {
                isValid: false,
                errorMessage:
                    "[development mode] No active build found for this prototype",
            };
        }
        if (existingDevData.orchestration_token !== providedToken) {
            logger.warn("Invalid orchestration token provided", {
                prototypeId,
                devKey,
            });
            return {
                isValid: false,
                errorMessage:
                    "[development mode] orchestration token is not valid for this prototype",
            };
        }
        return {
            isValid: true,
        };
    }

    // Get current build ID for this prototype from cache
    const currentBuildIdRaw = await cache.get(
        CACHE_KEYS.protoCurrentBuild(prototypeId),
    );

    if (!currentBuildIdRaw) {
        logger.warn("No active build found for prototype", { prototypeId });
        return {
            isValid: false,
            errorMessage: "No active build found for this prototype",
        };
    }

    // Convert GlideString to string
    const currentBuildId = typeof currentBuildIdRaw === "string"
        ? currentBuildIdRaw
        : currentBuildIdRaw.toString();

    // Fetch the active build from cache
    const activeBuild = await hgetallAsActiveBuild(
        cache,
        CACHE_KEYS.activeBuild(currentBuildId),
    );

    if (!activeBuild) {
        logger.error(
            new Error("Active build data not found in cache"),
            "Build metadata missing",
            { prototypeId, buildId: currentBuildId },
        );
        return {
            isValid: false,
            errorMessage: "Build metadata not found",
        };
    }

    // Validate the token
    if (activeBuild.orchestration_token !== providedToken) {
        logger.warn("Invalid orchestration token provided", {
            prototypeId,
            buildId: currentBuildId,
        });
        return {
            isValid: false,
            errorMessage: "Invalid orchestration token",
        };
    }

    // Token is valid
    logger.consoleLogDevOnly(
        "info",
        "Orchestration token validated successfully",
        {
            prototypeId,
            buildId: currentBuildId,
        },
    );

    return {
        isValid: true,
        buildId: currentBuildId,
    };
}
