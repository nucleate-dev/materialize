import { EditOperation, EditOperationResult } from '../types/chat';

export function extractEditOperationsFromMessage(message: string): EditOperationResult {
  try {
    // Look for JSON arrays in the message
    const jsonArrayRegex = /\[[\s\S]*?\]/g;
    const matches = message.match(jsonArrayRegex);
    
    if (!matches || matches.length === 0) {
      return {
        hasOperations: false,
        operations: [],
        message: message
      };
    }

    const operations: EditOperation[] = [];
    
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        
        // Check if it's an array of edit operations
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isValidEditOperation(item)) {
              operations.push(item as EditOperation);
            }
          }
        } else if (isValidEditOperation(parsed)) {
          // Single operation object
          operations.push(parsed as EditOperation);
        }
      } catch (parseError) {
        // Skip invalid JSON
        continue;
      }
    }

    if (operations.length === 0) {
      return {
        hasOperations: false,
        operations: [],
        message: message
      };
    }

    // Extract the message part (everything that's not JSON)
    let cleanMessage = message;
    for (const match of matches) {
      cleanMessage = cleanMessage.replace(match, '').trim();
    }

    return {
      hasOperations: true,
      operations,
      message: cleanMessage || 'Applied edit operations'
    };

  } catch (error) {
    console.error('Error extracting edit operations:', error);
    return {
      hasOperations: false,
      operations: [],
      message: message
    };
  }
}

function isValidEditOperation(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return false;
  }

  const operation = obj as Record<string, unknown>;

  // Check required fields
  if (!operation.type || !operation.target || !operation.description) {
    return false;
  }

  // Check valid operation types
  const validTypes = ['replace', 'insert', 'delete', 'move'];
  if (!validTypes.includes(operation.type as string)) {
    return false;
  }

  // Check target structure
  const target = operation.target as Record<string, unknown>;
  if (!target.file || typeof target.file !== 'string') {
    return false;
  }

  // For replace and insert operations, content is usually required
  if ((operation.type === 'replace' || operation.type === 'insert') && !operation.content) {
    // Allow empty content for some cases like clearing content
    if (operation.type === 'replace' && operation.content !== '') {
      console.warn('Replace operation without content:', operation.description);
    }
  }

  // For move operations, newFileName is required
  if (operation.type === 'move' && !operation.newFileName) {
    return false;
  }

  return true;
}

// Helper function to validate and clean edit operations
export function validateEditOperations(operations: EditOperation[]): {
  valid: EditOperation[];
  invalid: string[];
} {
  const valid: EditOperation[] = [];
  const invalid: string[] = [];

  for (const operation of operations) {
    if (isValidEditOperation(operation)) {
      valid.push(operation);
    } else {
      invalid.push(`Invalid operation: ${operation.description || 'Unknown operation'}`);
    }
  }

  return { valid, invalid };
}

// Debug helper to log edit operations
export function logEditOperations(operations: EditOperation[]): void {
  console.group('Edit Operations Detected:');
  operations.forEach((op, index) => {
    console.log(`${index + 1}. ${op.type.toUpperCase()}: ${op.description}`);
    console.log(`   File: ${op.target.file}`);
    if (op.target.startLine) console.log(`   Lines: ${op.target.startLine}-${op.target.endLine || op.target.startLine}`);
    if (op.target.pattern) console.log(`   Pattern: ${op.target.pattern}`);
    if (op.target.functionName) console.log(`   Function: ${op.target.functionName}`);
    if (op.target.componentName) console.log(`   Component: ${op.target.componentName}`);
    if (op.content) console.log(`   Content Length: ${op.content.length} chars`);
    console.log('---');
  });
  console.groupEnd();
}