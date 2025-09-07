# SystemLogger

A structured logging system optimized for CloudWatch Logs with EMF (Embedded Metric Format) support for AWS CloudWatch metrics. Designed for server-side Node.js applications running in EC2, ECS/Fargate, or Lambda environments.

## Features

- **Structured JSON Logging**: All logs output as JSON to stdout for CloudWatch consumption
- **EMF Metrics**: Automatic CloudWatch metrics generation via Embedded Metric Format
- **Request Context**: Per-request logger instances with tracing support
- **Security**: Automatic redaction of sensitive fields (passwords, tokens, etc.)
- **Performance Timing**: Built-in timing utilities for measuring function execution
- **Development Debugging**: Console logging for development environments only

## Setup

### Base Logger Initialization

```typescript
import { SystemLogger } from './loggers/SystemLogger.js';

export const baseLogger = new SystemLogger({
  service: 'control-plane',
  env: process.env.NODE_ENV || 'development',
  metricNamespace: 'Materialize/Service',
  redactKeys: ['authorization', 'cookie', 'x-api-key'],
});
```

### Fastify Integration

The logger is integrated into Fastify via a request hook that creates per-request logger instances:

```typescript
import { genRequestIds } from './loggers/SystemLogger.js';

// Extend FastifyRequest to include our custom logger
declare module 'fastify' {
  interface FastifyRequest {
    log2: SystemLogger;
  }
}

// Add request hook to create per-request logger
fastify.addHook('onRequest', async (req) => {
  const { requestId, traceId } = genRequestIds(req.headers);
  req.log2 = baseLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
  });
});
```

## Usage

### Basic Logging Levels

```typescript
// In route handlers
fastify.get('/api/example', async (request, reply) => {
  const logger = request.log2;
  
  // Info level
  logger.info('Processing request', { userId: '123' });
  
  // Warning level
  logger.warn('Deprecated endpoint used', { 
    endpoint: request.url,
    userAgent: request.headers['user-agent'] 
  });
  
  // Error handling
  try {
    // Some operation
  } catch (error) {
    logger.error(error, 'Operation failed', { 
      operation: 'example-operation' 
    });
  }
  
  // Debug level (only logs to structured output)
  logger.debug('Request details', { 
    params: request.params,
    query: request.query 
  });
});
```

### Development Console Logging

For development debugging that only shows in development mode:

```typescript
// Console output only in development
logger.consoleLogDevOnly('info', 'Debug message for development', {
  debugData: { foo: 'bar' }
});

// Different log levels
logger.consoleLogDevOnly('error', 'Error details', { error: errorObj });
logger.consoleLogDevOnly('warn', 'Warning message');
logger.consoleLogDevOnly('debug', 'Debug information');
```

### Domain Events

Log business events that you want to track and analyze:

```typescript
// Track business events
logger.event('user_registered', { 
  userId: '123', 
  plan: 'pro',
  referrer: 'google' 
});

logger.event('prototype_created', {
  prototypeId: 'proto-456',
  userId: '123',
  templateType: 'blank'
});
```

### CloudWatch Metrics (EMF)

#### Count Metrics
```typescript
// Simple count
logger.metricCount('api_requests');

// Count with value and dimensions
logger.metricCount('user_registrations', 1, { 
  plan: 'pro', 
  source: 'web' 
});
```

#### Timing Metrics
```typescript
// Manual timing
logger.metricTiming('database_query_duration', 150); // 150ms

// Automatic timing with function wrapper
const result = await logger.time('database_operation', async () => {
  return await database.query('SELECT * FROM users');
}, { queryType: 'select' });

// Manual timer
const endTimer = logger.startTimer('file_processing');
// ... do work ...
const duration = endTimer({ fileType: 'image' }); // Records metric and returns duration
```

### Child Loggers

Create child loggers with additional context:

```typescript
// In service classes
class UserService {
  private logger: SystemLogger;

  constructor(baseLogger: SystemLogger) {
    this.logger = baseLogger.child({
      service: 'user-service',
      component: 'UserService'
    });
  }

  async createUser(userData: any) {
    const userLogger = this.logger.child({ 
      userId: userData.id,
      operation: 'create_user' 
    });
    
    userLogger.info('Creating user', { email: userData.email });
    
    try {
      const user = await this.database.create(userData);
      userLogger.event('user_created', { userId: user.id });
      return user;
    } catch (error) {
      userLogger.error(error, 'Failed to create user');
      throw error;
    }
  }
}
```

### Context Management

Update logger context dynamically:

```typescript
const logger = request.log2;

// Add context as you progress through the request
logger.setContext({ 
  userId: authenticatedUserId,
  tenantId: 'tenant-123' 
});

logger.info('User authenticated', { role: 'admin' });
```

## Configuration Options

### SystemLoggerOptions

```typescript
interface SystemLoggerOptions {
  service: string;              // Service name (e.g., 'control-plane')
  env: string;                  // Environment ('development', 'production')
  redactKeys?: string[];        // Additional keys to redact (beyond defaults)
  defaultDimensions?: Record<string, string>; // Default EMF dimensions
  metricNamespace?: string;     // CloudWatch metric namespace
}
```

### Default Redacted Keys

The following keys are automatically redacted from logs:
- `password`
- `authorization` 
- `auth`
- `token`
- `access_token`
- `refresh_token`
- `secret`
- `api_key`

### LoggerContext Properties

```typescript
interface LoggerContext {
  requestId?: string;    // Request correlation ID
  traceId?: string;      // Distributed tracing ID
  userId?: string;       // Authenticated user ID  
  prototypeId?: string; // Prototype being operated on
  route?: string;        // API route path
  method?: string;       // HTTP method
  service?: string;      // Service name
  env?: string;          // Environment
  [key: string]: unknown; // Any additional context
}
```

## Best Practices

1. **Use Per-Request Loggers**: Always use `request.log2` in route handlers for automatic request correlation
2. **Structured Fields**: Include relevant structured data in log fields for better searchability
3. **Consistent Context**: Use child loggers to maintain consistent context across related operations
4. **Business Events**: Use `logger.event()` for trackable business metrics
5. **Error Context**: Always include relevant context when logging errors
6. **Performance Metrics**: Use timing methods to track performance-critical operations
7. **Security**: Let the logger handle redaction - don't manually filter sensitive data

## Environment Considerations

- **Development**: Use `consoleLogDevOnly()` for debugging that shouldn't appear in production
- **Production**: All logs go to CloudWatch as structured JSON
- **NODE_ENV**: Must be set to `'development'` for console debug logging to work

## CloudWatch Integration

Logs automatically appear in CloudWatch Logs with:
- **Log Group**: Based on your ECS/Lambda configuration
- **Structured Search**: JSON format enables easy filtering and searching
- **Custom Metrics**: EMF logs create CloudWatch metrics automatically
- **Dashboards**: Use logged metrics and dimensions for monitoring dashboards