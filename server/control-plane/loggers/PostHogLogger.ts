// PostHogLogger.ts
// A specialized logger for PostHog events with timing and attempt tracking
//
// Usage Example:
//
//   import { PostHog } from 'posthog-node';
//   import { PostHogLogger } from './loggers/PostHogLogger.js';
//   import { PostHogEvents } from './loggers/PostHogEvents.js';
//
//   // Initialize PostHog client (do this once at app startup)
//   const posthog = new PostHog('YOUR_API_KEY', {
//     host: 'https://app.posthog.com'
//   });
//
//   // Create logger with context (userId is NOT stored in context)
//   const logger = new PostHogLogger({
//     posthog,
//     context: {
//       service: 'control-plane',
//       env: 'production'
//     }
//   });
//
//   // 1. Record a simple event (userId required)
//   logger.capture(
//     'user_123', // userId must be passed explicitly
//     PostHogEvents.stripe_checkout_session_created,
//     {
//       prototypeId: 'proto_456',
//       template: 'nextjs'
//     }
//   );
//
//   // 2. Time a function (userId required)
//   const result = await logger.time(
//     'user_123', // userId must be passed explicitly
//     PostHogEvents.stripe_checkout_session_created,
//     async () => await buildProject(),
//     { prototypeId: 'proto_456' }
//   );
//
//   // 3. Record attempts and success/failure with error tracking (userId required)
//   const payment = await logger.recordAttempt(
//     'user_123', // userId must be passed explicitly
//     PostHogEvents.stripe_checkout_session_created,
//     async () => await processPayment(), // function to execute
//     { prototypeId: 'proto_456' }
//   );
//
//   // 4. Combine timing + attempt tracking with error details (userId required)
//   const deployed = await logger.timeAndRecord(
//     'user_123', // userId must be passed explicitly
//     PostHogEvents.stripe_checkout_session_created,
//     async () => await deployToProduction(),
//     { prototypeId: 'proto_456' }
//   );
//
import { PostHog } from 'posthog-node';
import { PostHogEvent } from './PostHogEvents.js';

export type PostHogContext = {
  server?: string;
  service?: string;
  env?: string;
  prototypeId?: string;
  userId?: string;
  function?: string;
  // Any other contextual data you want to include in all events
  [key: string]: unknown;
};

export type PostHogLoggerOptions = {
  posthog: PostHog;
  context?: PostHogContext;
};

const nowMs =
  typeof performance !== 'undefined' && performance?.now
    ? (): DOMHighResTimeStamp => performance.now()
    : (): number => Date.now();

export class PostHogLogger {
  private posthog: PostHog;
  private context: PostHogContext;

  constructor(opts: PostHogLoggerOptions) {
    this.posthog = opts.posthog;
    this.context = opts.context ?? {};
  }

  /**
   * Create a child logger with additional context.
   * Useful for adding request-specific or prototype-specific context.
   */
  child(extraContext: PostHogContext): PostHogLogger {
    return new PostHogLogger({
      posthog: this.posthog,
      context: { ...this.context, ...extraContext },
    });
  }

  /**
   * Update the context for this logger instance.
   */
  setContext(extraContext: PostHogContext): void {
    this.context = { ...this.context, ...extraContext };
  }

  /**
   * Capture a generic event with custom properties.
   * Requires userId to be explicitly passed for each event.
   */
  capture(
    userId: string,
    event: PostHogEvent,
    properties: Record<string, unknown> = {},
  ): void {
    this.posthog.capture({
      distinctId: userId,
      event,
      properties: {
        ...this.context,
        ...properties,
      },
    });
  }

  /**
   * Execute a function and record attempt/success/failure.
   * Records attempt before execution, then records outcome with error details on failure.
   */
  async recordAttempt<T>(
    userId: string,
    event: PostHogEvent,
    fn: () => Promise<T>,
    properties: Record<string, unknown> = {},
  ): Promise<T> {
    // Record the attempt
    this.capture(userId, event, {
      ...properties,
      execution_stage: 'attempt',
    });

    try {
      const result = await fn();

      // Record success
      this.capture(userId, event, {
        ...properties,
        execution_stage: 'success',
      });

      return result;
    } catch (err) {
      // Extract error details
      const errorDetails = this.extractErrorDetails(err);

      // Record failure with error details
      this.capture(userId, event, {
        ...properties,
        execution_stage: 'failure',
        ...errorDetails,
      });

      throw err;
    }
  }

  /**
   * Time a function execution and emit a timing event.
   * Returns the function result and emits duration in milliseconds.
   */
  async time<T>(
    userId: string,
    event: PostHogEvent,
    fn: () => Promise<T>,
    properties: Record<string, unknown> = {},
  ): Promise<T> {
    const start = nowMs();
    try {
      const result = await fn();
      const duration = nowMs() - start;

      this.capture(userId, event, {
        ...properties,
        duration_ms: Math.round(duration),
        execution_stage: 'success',
      });

      return result;
    } catch (err) {
      const duration = nowMs() - start;
      const errorDetails = this.extractErrorDetails(err);

      this.capture(userId, event, {
        ...properties,
        duration_ms: Math.round(duration),
        execution_stage: 'failure',
        ...errorDetails,
      });

      throw err;
    }
  }

  /**
   * Time a function AND record attempt/success/failure in one go.
   * This is a convenience method that combines time() and recordAttempt().
   *
   * Emits events:
   * - On start: {event} with attempt=true
   * - On completion: {event} with outcome='success'/'failure', duration_ms, and error details if failed
   */
  async timeAndRecord<T>(
    userId: string,
    event: PostHogEvent,
    fn: () => Promise<T>,
    properties: Record<string, unknown> = {},
  ): Promise<T> {
    // Record attempt
    this.capture(userId, event, {
      ...properties,
      execution_stage: 'attempt',
    });

    const start = nowMs();
    try {
      const result = await fn();
      const duration = nowMs() - start;

      // Record success with timing
      this.capture(userId, event, {
        ...properties,
        duration_ms: Math.round(duration),
        execution_stage: 'success',
      });

      return result;
    } catch (err) {
      const duration = nowMs() - start;
      const errorDetails = this.extractErrorDetails(err);

      // Record failure with timing and error details
      this.capture(userId, event, {
        ...properties,
        duration_ms: Math.round(duration),
        execution_stage: 'failure',
        ...errorDetails,
      });

      throw err;
    }
  }

  /**
   * Identify a user with additional properties.
   * Useful for setting user traits/attributes.
   */
  identify(userId: string, properties: Record<string, unknown> = {}): void {
    this.posthog.identify({
      distinctId: userId,
      properties,
    });
  }

  /**
   * Alias a user - connect anonymous events to an identified user.
   * Call this when a user logs in after being anonymous.
   */
  alias(alias: string, distinctId: string): void {
    this.posthog.alias({
      alias,
      distinctId,
    });
  }

  /**
   * Flush all pending events to PostHog.
   * Call this before shutting down the application.
   */
  async shutdown(): Promise<void> {
    await this.posthog.shutdown();
  }

  /**
   * Extract detailed error information from an error object.
   * Returns error message, code, stack trace, and error name.
   */
  private extractErrorDetails(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
      const errorWithExtras = err as Error & {
        code?: string | number;
      };

      const details: Record<string, unknown> = {
        error_message: err.message,
        error_name: err.name,
      };

      if (err.stack) {
        details.error_stack = err.stack;
      }

      if (errorWithExtras.code !== undefined) {
        details.error_code = errorWithExtras.code;
      }

      return details;
    }

    // For non-Error objects
    return {
      error_message: String(err),
      error_name: 'UnknownError',
    };
  }
}
