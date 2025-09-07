# ProductLogger

A comprehensive logging utility for client-side Next.js applications with PostHog integration and development debugging capabilities.

## Features

- **Debug Logging**: Console logging that only appears in development mode
- **PostHog Integration**: Seamless event tracking with PostHog analytics
- **Standardized Schema**: Consistent event structure with customizable properties
- **React Hook**: Easy integration with React components via `useProductLogger()`
- **Singleton Support**: Non-React usage with `getProductLogger()`
- **TypeScript Support**: Fully typed with proper PostHog React types

## Installation

The logger is already set up in your Next.js application. Simply import and use:

```typescript
import { useProductLogger } from "./ClientProductLogger";
```

## Usage

### React Components

```typescript
import { useProductLogger } from "./ClientProductLogger";
import { LoggingEventSource } from "../../LoggingEvents";

export function ExampleComponent() {
  const logger = useProductLogger();

  const handleButtonClick = () => {
    // Debug log (only shows in development)
    logger.debug("Button clicked in ExampleComponent", "log", {
      timestamp: new Date().toISOString(),
    });

    // Custom event log
    logger.log({
      event: "example-feature-used",
      properties: {
        feature: "example-feature",
        functionName: "handleButtonClick",
        component: "ExampleComponent",
        source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
        additionalData: {
          clickCount: 1,
          timestamp: Date.now(),
        },
      },
    });
  };

  return <button onClick={handleButtonClick}>Click me</button>;
}
```

### Debug Levels

The logger supports three debug levels that only log in development:

```typescript
function debugLevelsExample() {
  const logger = useProductLogger();

  // Info level debug
  logger.debug("Process started successfully", "log", {
    processId: "proc-123",
  });

  // Warning level debug
  logger.debug("Deprecated API endpoint used", "warn", {
    endpoint: "/old-api/users",
    suggestion: "Use /api/v2/users instead",
  });

  // Error level debug
  logger.debug("Critical system error detected", "error", {
    errorCode: "SYS_001",
    severity: "high",
  });
}
```

### Advanced Logging

```typescript
function advancedLoggingExample() {
  const logger = useProductLogger();

  // Custom event with detailed properties
  logger.log({
    event: "CUSTOM_WORKFLOW_COMPLETED",
    properties: {
      functionName: "advancedLoggingExample",
      component: "WorkflowManager",
      userId: "user-456",
      source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
      additionalData: {
        workflowType: "data-processing",
        duration: 5000,
        recordsProcessed: 1500,
        success: true,
      },
    },
  });

  // Error handling with context
  try {
    // Some operation that might fail
    throw new Error("Simulated error");
  } catch (error) {
    logger.log({
      event: "CUSTOM_WORKFLOW_ERROR",
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
        functionName: "advancedLoggingExample",
        component: "WorkflowManager",
        userId: "user-456",
        additionalData: {
          context: "workflow-execution",
          retryAttempts: 2,
        },
        error,
      },
    });
  }
}
```

## API Reference

### ProductLogger Class

#### Methods

- `debug(message: string, level: LogLevel = "log", additionalData?: Record<string, unknown>): void`
  - Logs to console only in development mode
  - Supports "log", "warn", "error" levels

- `log(eventData: ProductLogEvent): void`
  - Logs events to PostHog
  - Also logs to console in development mode

#### Types

```typescript
export type LogLevel = "log" | "warn" | "error";

export interface ProductLogProperties {
  source: string;
  functionName?: string;
  fileName?: string;
  component?: string;
  userId?: string;
  // Specific event data
  action?: string;
  page?: string;
  feature?: string;
  // Additional flexible data
  additionalData?: Record<string, unknown>;
  [key: string]: unknown; // Allow any additional properties
}

export interface ProductLogEvent {
  event: string;
  properties?: ProductLogProperties;
}
```

### Hooks and Functions

- `useProductLogger(): ProductLogger` - React hook for component usage
- `getProductLogger(): ProductLogger` - Singleton for non-React usage

## Environment Configuration

The logger automatically detects the environment:

- **Development**: `npm run dev` → Debug logs appear in console
- **Production**: `npm run build && npm run start` → Debug logs are hidden

No manual configuration needed for `NODE_ENV`.

## Best Practices

1. **Always include source**: Specify the `source` property to identify where events originate
2. **Use meaningful event names**: Choose descriptive event names for better analytics
3. **Include function context**: Add `functionName` for debugging and tracing
4. **Structured data**: Use `additionalData` for flexible, structured information
5. **Error handling**: Always log errors with sufficient context for debugging

## Integration with LoggingEvents

Use the standardized events from `LoggingEvents.ts`:

```typescript
import { LoggingEventSource } from "../../LoggingEvents";

// Use predefined sources
source: LoggingEventSource.API_PAYMENTS_CHECKOUT
```