import { PlannedOperation } from "@/components/PlanningView";
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

/**
 * Extract execution plan from AI message
 */
export function extractExecutionPlan(message: string): PlanningExtractionResult {
  const result: PlanningExtractionResult = {
    hasPlan: false,
    operations: [],
    executionSteps: {},
    message: message
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
          result.operations = planData.map((item: Record<string, unknown>, index: number) => ({
            id: item.id || (index + 1).toString(),
            type: item.type || "modify",
            title: item.title || "Unknown operation",
            description: item.description || "No description provided",
            filePath: item.filePath || "unknown",
            newFilePath: item.newFilePath,
            status: "pending" as const,
          }));

          // Remove the plan from the message
          result.message = message.replace(/\*\*EXECUTION_PLAN:\*\*\s*\[[\s\S]*?\]/, '').trim();
        }
      } catch (parseError) {
        console.warn("Failed to parse execution plan JSON:", parseError);
      }
    }

    // Extract execution steps
    const stepMatches = [...message.matchAll(/\*\*EXECUTION_STEP_(\d+):\*\*\s*(\[[\s\S]*?\])(?=\n\*\*EXECUTION_STEP_|\n\*\*|$)/g)];
    
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
        console.warn(`Failed to parse execution step ${stepId} JSON:`, parseError);
      }
    }

  } catch (error) {
    console.error("Error extracting execution plan:", error);
  }

  return result;
}

/**
 * Extract a specific execution step from AI message
 */
export function extractExecutionStep(message: string, stepId: string): ExecutionStepResult {
  const result: ExecutionStepResult = {
    hasStep: false,
    stepId,
    operations: []
  };

  try {
    const stepPattern = new RegExp(`\\*\\*EXECUTION_STEP_${stepId}:\\*\\*\\s*(\\[[\\s\\S]*?\\])`, 'g');
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
          console.warn(`Failed to parse execution step ${stepId} JSON:`, parseError);
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting execution step ${stepId}:`, error);
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
  return stepMatches.map(match => match[1]);
}

/**
 * Validate planned operation
 */
export function isValidPlannedOperation(operation: unknown): operation is PlannedOperation {
  return (
    operation &&
    typeof operation === 'object' &&
    typeof operation.id === 'string' &&
    ['create', 'modify', 'delete', 'move'].includes(operation.type) &&
    typeof operation.title === 'string' &&
    typeof operation.description === 'string' &&
    typeof operation.filePath === 'string'
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
      console.table(result.operations.map(op => ({
        id: op.id,
        type: op.type,
        title: op.title,
        file: op.filePath
      })));
    }
    
    if (Object.keys(result.executionSteps).length > 0) {
      for (const [stepId, operations] of Object.entries(result.executionSteps)) {
        console.log(`Step ${stepId} operations:`, operations.length);
      }
    }
    
    console.groupEnd();
  }
}