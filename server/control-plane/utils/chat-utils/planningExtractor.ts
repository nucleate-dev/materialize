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
        console.warn(
          `Failed to parse execution step ${stepId} JSON:`,
          parseError,
        );
      }
    }
  } catch (error) {
    console.error('Error extracting execution plan:', error);
  }

  return result;
}

/**
 * Extract a specific execution step from AI message
 */
export function extractExecutionStep(
  message: string,
  stepId: string,
): ExecutionStepResult {
  const result: ExecutionStepResult = {
    hasStep: false,
    stepId,
    operations: [],
  };

  try {
    const stepPattern = new RegExp(
      `\\*\\*EXECUTION_STEP_${stepId}:\\*\\*\\s*(\\[[\\s\\S]*?\\])`,
      'g',
    );
    const stepMatch = message.match(stepPattern);

    if (stepMatch && stepMatch[0]) {
      const jsonMatch = stepMatch[0].match(/\[[\s\S]*?\]/);

      if (jsonMatch) {
        try {
          const stepOperations = JSON.parse(jsonMatch[0]);

          if (Array.isArray(stepOperations)) {
            result.hasStep = true;
            result.operations = stepOperations;
          }
        } catch (parseError) {
          console.warn(
            `Failed to parse execution step ${stepId} JSON:`,
            parseError,
          );
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting execution step ${stepId}:`, error);
  }

  return result;
}

/**
 * Extract step result from AI message
 */
export function extractStepResult(message: string): StepResult {
  const result: StepResult = {
    hasResult: false,
    filePath: '',
    content: '',
    message: message,
  };

  try {
    // Look for **STEP_RESULT:** pattern followed by a code block
    const stepResultMatch = message.match(
      /\*\*STEP_RESULT:\*\*\s*```(?:javascript|js)?\s*([\s\S]*?)```/,
    );

    if (stepResultMatch) {
      result.hasResult = true;
      result.content = stepResultMatch[1].trim();

      // Remove the step result from the message
      result.message = message
        .replace(
          /\*\*STEP_RESULT:\*\*\s*```(?:javascript|js)?\s*[\s\S]*?```/,
          '',
        )
        .trim();
    }
  } catch (error) {
    console.error('Error extracting step result:', error);
  }

  return result;
}

/**
 * Check if message contains any execution steps
 */
export function hasExecutionSteps(message: string): boolean {
  return /\*\*EXECUTION_STEP_\d+:\*\*/.test(message);
}

/**
 * Get all execution step IDs from message
 */
export function getExecutionStepIds(message: string): string[] {
  const stepMatches = [...message.matchAll(/\*\*EXECUTION_STEP_(\d+):\*\*/g)];
  return stepMatches.map((match) => match[1]);
}

/**
 * Validate planned operation
 */
export function isValidPlannedOperation(
  operation: unknown,
): operation is PlannedOperation {
  return (
    operation !== null &&
    typeof operation === 'object' &&
    'id' in operation &&
    typeof (operation as Record<string, unknown>).id === 'string' &&
    'type' in operation &&
    ['create', 'modify', 'delete', 'move'].includes(
      (operation as Record<string, unknown>).type as string,
    ) &&
    'title' in operation &&
    typeof (operation as Record<string, unknown>).title === 'string' &&
    'description' in operation &&
    typeof (operation as Record<string, unknown>).description === 'string' &&
    'filePath' in operation &&
    typeof (operation as Record<string, unknown>).filePath === 'string'
  );
}

/**
 * Log planning extraction for debugging
 */
export function logPlanningExtraction(result: PlanningExtractionResult): void {
  if (process.env.NODE_ENV === 'development') {
    console.group('🎯 Planning Extraction Result');
    console.log('Has Plan:', result.hasPlan);
    console.log('Operations Count:', result.operations.length);
    console.log('Execution Steps:', Object.keys(result.executionSteps));

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
        console.log(`Step ${stepId} operations:`, operations.length);
      }
    }

    console.groupEnd();
  }
}
