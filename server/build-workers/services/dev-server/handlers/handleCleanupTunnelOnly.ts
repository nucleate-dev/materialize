import { FastifyReply, FastifyRequest } from "fastify";
import {
    BuildAndDeployResponse,
    HTTP_STATUS,
    SandboxAPIResponse,
    StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";

export async function handleCleanupTunnelOnly(
    request: FastifyRequest<{}>,
    reply: FastifyReply,
    developmentServerService: NucleateDevelopmentServerService,
): Promise<
    SandboxAPIResponse<
        BuildAndDeployResponse,
        StandardErrorResponse
    >
> {
    // 1.1. Kill the cloudflare tunnel
    try {
        await developmentServerService.cloudflareTunnelManagementService
            .killTunnel();
        request.log2.consoleLogDevOnly(
            "info",
            "Cloudflare tunnel killed successfully",
        );
        reply.status(HTTP_STATUS.OK);
        return {
            data: {
                message: "Cloudflare tunnel killed successfully",
            },
            error: null,
        };
    } catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : String(error);
        request.log2.error(
            new Error(errorMessage),
            "Failed to kill Cloudflare tunnel",
        );
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
            data: null,
            error: {
                error: "TUNNEL_CLEANUP_ERROR",
                message: `Failed to kill Cloudflare tunnel: ${errorMessage}`,
            },
        };
    }
}
