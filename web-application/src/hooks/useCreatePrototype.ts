import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";

interface CreatePrototypeOptions {
  name?: string;
  design_style?: CreatePrototypeRequestBody["design_style"];
  custom_design_system?: CreatePrototypeRequestBody["custom_design_system"];
  description?: string;
  folder_id?: string | null;
  prototype_id?: string;
  visibility?: CreatePrototypeRequestBody["visibility"];
}

export function useCreatePrototype() {
  const logger = useProductLogger();

  const createPrototype = async (
    options: CreatePrototypeOptions = {},
  ): Promise<
    APIResponse<CreatePrototypeSuccessResponse, CreatePrototypeErrorResponse>
  > => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return {
          data: null,
          error: {
            error: "AUTH_REQUIRED",
            message: "Authentication token missing",
          },
        };
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: "New Prototype",
            ...options,
          } as CreatePrototypeRequestBody),
        },
      );

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (!response.ok && result.error) {
        logger.debug("error", "Create prototype request failed", result.error);
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
          error: "UNKNOWN",
          message:
            error instanceof Error ? error.message : "Failed to create prototype",
        },
      };
    }
  };

  return { createPrototype };
}
