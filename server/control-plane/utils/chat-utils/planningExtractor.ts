import { SystemLogger } from '../../loggers/SystemLogger.js';

export interface PlanningExtractionResult {
  hasPlan: boolean;
  operations: PlannedOperation[];
  executionSteps: { [stepId: string]: EditOperation[] };
  message: string; // message with plan/steps removed for display
}

export interface StepResult {
  hasResult: boolean;
  filePath: string;
  content: string;
  message: string; // message with step result removed for display
}

export interface PlannedOperation {
  id: string;
  type: 'create' | 'modify' | 'delete' | 'move';
  title: string;
  description: string;
  filePath: string;
  newFilePath?: string; // for move operations
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  error?: string;
}

export interface EditOperation {
  type: 'replace' | 'insert' | 'delete' | 'move';
  target: EditTarget;
  content?: string;
  description: string;
  newFileName?: string; // for move operations or creating new files
}

// New interfaces for granular edit operations
export interface EditTarget {
  file: string;
  startLine?: number;
  endLine?: number;
  pattern?: string; // regex pattern for pattern-based replacements
  functionName?: string; // for function-level replacements
  componentName?: string; // for component-level replacements
}

/**
 * Extract execution plan from AI message
 */
export function extractExecutionPlan(
  message: string,
  log2: SystemLogger,
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
                (item.type as 'modify' | 'create' | 'delete' | 'move') ||
                'modify',
              title: (item.title as string) || 'Unknown operation',
              description:
                (item.description as string) || 'No description provided',
              filePath: (item.filePath as string) || 'unknown',
              newFilePath: item.newFilePath as string | undefined,
              status: 'pending' as const,
            }),
          );

          // Remove the plan from the message
          result.message = message
            .replace(/\*\*EXECUTION_PLAN:\*\*\s*\[[\s\S]*?\]/, '')
            .trim();
        }
      } catch (parseError) {
        console.warn('Failed to parse execution plan JSON:', parseError);
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
          result.message = result.message.replace(match[0], '').trim();
        }
      } catch (parseError) {
        log2.error(parseError, `Failed to parse execution step ${stepId} JSON`);
      }
    }
  } catch (error) {
    log2.error(error, 'Error extracting execution plan');
  }

  return result;
}
