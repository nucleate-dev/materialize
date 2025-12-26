import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { fetchPersonalTeamId } from "@/lib/utils/payments/CheckoutUtils";

type CreatePrototypeOptions = {
  name?: string;
  folder_id?: string | null;
  creation_source: CreatePrototypeRequestBody["creation_source"];
} & Partial<
  Omit<
    CreatePrototypeRequestBody,
    "name" | "creation_source" | "folder_id" | "team_id"
  >
>;

export function useCreatePrototype() {
  const logger = useProductLogger();

  const createPrototype = async (
    options: CreatePrototypeOptions,
  ): Promise<
    APIResponse<CreatePrototypeSuccessResponse, CreatePrototypeErrorResponse>
  > => {
    try {
      if (!options?.creation_source) {
        logger.debug("error", "creation_source is required to create prototype");
        return {
          data: null,
          error: {
            error: "INVALID_REQUEST",
            message: "creation_source is required",
          },
        };
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return {
          data: null,
          error: {
            error: "UNAUTHORIZED",
            message: "Authentication token missing",
          },
        };
      }

      const { creation_source, name, folder_id, ...rest } = options;

      const userId = session.data.session?.user.id;
      if (!userId) {
        return {
          data: null,
          error: {
            error: "UNAUTHORIZED",
            message: "User session missing",
          },
        };
      }

      const teamId = await fetchPersonalTeamId(userId);
      if (!teamId) {
        logger.debug(
          "error",
          "Unable to determine personal team for prototype creation",
        );
        return {
          data: null,
          error: {
            error: "INVALID_REQUEST",
            message: "No personal team found for user",
          },
        };
      }

      const payload: CreatePrototypeRequestBody = {
        name: name ?? "New Prototype",
        creation_source,
        team_id: teamId,
        ...rest,
      };

      if (folder_id) {
        payload.folder_id = folder_id;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (!response.ok && result.error) {
        logger.debug("error", "Create prototype request failed", {
          ...result.error,
        });
      }

      return result;
    } catch (error) {
      logger.debug("error", "Error creating prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        data: null,
        error: {
          error: "DATABASE_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create prototype",
        },
      };
    }
  };

  return { createPrototype };
}
