import { PlannedOperation } from "@/components/prototype-editor/PlanningView";
import { ClientProductLogger } from "@/lib/loggers/ClientProductLogger";
import { EditOperation } from "@/lib/types/chat";

export interface PlanningExtractionResult {
  hasPlan: boolean;
  operations: PlannedOperation[];
  executionSteps: { [stepId: string]: EditOperation[] };
  message: string; // message with plan/steps removed for display
}

export interface ExecutionStepResult {
  hasStep: boolean;
  stepId: string;
  operations: EditOperation[];
}

export interface StepResult {
  hasResult: boolean;
  filePath: string;
  content: string;
  message: string; // message with step result removed for display
}

/**
 * Extract execution plan from AI message
 */
export function extractExecutionPlan(
  message: string,
  logger: ClientProductLogger,
): PlanningExtractionResult {
  const result: PlanningExtractionResult = {
    hasPlan: false,
    operations: [],
    executionSteps: {},
    message: message,
  };

  try {
    // Look for **EXECUTION_PLAN:** pattern
    const planMatch = message.match(/\*\*EXECUTION_PLAN:\*\*\s*(\[[\s\S]*?\])/);

    if (planMatch) {
      const planJson = planMatch[1];

      try {
        const planData = JSON.parse(planJson);

        if (Array.isArray(planData)) {
          result.hasPlan = true;
          result.operations = planData.map(
            (item: Record<string, unknown>, index: number) => ({
              id: (item.id as string) || (index + 1).toString(),
              type:
                (item.type as "modify" | "create" | "delete" | "move") ||
                "modify",
              title: (item.title as string) || "Unknown operation",
              description:
                (item.description as string) || "No description provided",
              filePath: (item.filePath as string) || "unknown",
              newFilePath: item.newFilePath as string | undefined,
              status: "pending" as const,
            }),
          );

          // Remove the plan from the message
          result.message = message
            .replace(/\*\*EXECUTION_PLAN:\*\*\s*\[[\s\S]*?\]/, "")
            .trim();
        }
      } catch (parseError) {
        logger.debug("warn", "Failed to parse execution plan JSON:", {
          parseError,
        });
      }
    }

    // Extract execution steps
    const stepMatches = [
      ...message.matchAll(
        /\*\*EXECUTION_STEP_(\d+):\*\*\s*(\[[\s\S]*?\])(?=\n\*\*EXECUTION_STEP_|\n\*\*|$)/g,
      ),
    ];

    for (const match of stepMatches) {
      const stepId = match[1];
      const stepJson = match[2];

      try {
        const stepOperations = JSON.parse(stepJson);

        if (Array.isArray(stepOperations)) {
          result.executionSteps[stepId] = stepOperations;

          // Remove this step from the message
          result.message = result.message.replace(match[0], "").trim();
        }
      } catch (parseError) {
        logger.debug("warn", `Failed to parse execution step ${stepId} JSON:`, {
          parseError,
        });
      }
    }
  } catch (error) {
    logger.debug("error", "Error extracting execution plan:", {
      error,
    });
  }

  return result;
}

/**
 * Log planning extraction for debugging
 */
export function logPlanningExtraction(result: PlanningExtractionResult): void {
  if (process.env.NODE_ENV === "development") {
    console.group("🎯 Planning Extraction Result");
    // eslint-disable-next-line no-restricted-syntax
    console.log("Has Plan:", result.hasPlan);
    // eslint-disable-next-line no-restricted-syntax
    console.log("Operations Count:", result.operations.length);
    // eslint-disable-next-line no-restricted-syntax
    console.log("Execution Steps:", Object.keys(result.executionSteps));

    if (result.operations.length > 0) {
      console.table(
        result.operations.map((op) => ({
          id: op.id,
          type: op.type,
          title: op.title,
          file: op.filePath,
        })),
      );
    }

    if (Object.keys(result.executionSteps).length > 0) {
      for (const [stepId, operations] of Object.entries(
        result.executionSteps,
      )) {
        // eslint-disable-next-line no-restricted-syntax
        console.log(`Step ${stepId} operations:`, operations.length);
      }
    }

    console.groupEnd();
  }
}
