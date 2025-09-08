// SystemLogger.ts
// A structured logger that writes JSON to stdout, optimized for CloudWatch Logs + EMF metrics.
// Works in EC2, ECS/Fargate, Lambda (stdout). No runtime deps.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LoggerContext = {
  // High-cardinality identifiers you want to search by:
  requestId?: string; // x-request-id or generated
  traceId?: string; // upstream trace (e.g., from gateway)
  userId?: string; // auth'd user
  prototypeId?: string; // prototype id
  route?: string; // /api/xyz
  method?: string; // GET/POST
  service?: string; // "control-plane" / "build-worker"
  env?: string; // "prod" | "staging" | "dev"
  // Anything else you want to carry along:
  [k: string]: unknown;
};

type NormalizedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: {
    name: string;
    message: string;
    stack?: string;
  };
};

type EMFMetric = {
  Name: string;
  Unit?:
    | 'Count'
    | 'Milliseconds'
    | 'Seconds'
    | 'Percent'
    | 'Bytes'
    | 'Kilobytes'
    | 'Megabytes'
    | 'Gigabytes';
};

type EMFStructure = {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: EMFMetric[];
    }>;
  };
  [key: string]: unknown;
};

export type SystemLoggerOptions = {
  service: string;
  env: string;
  redactKeys?: string[]; // keys to redact in fields (e.g., ["authorization","password","token"])
  defaultDimensions?: Record<string, string>; // EMF dimensions
  metricNamespace?: string; // EMF namespace, e.g. "Materialize/Service"
};

const DEFAULT_REDACTIONS = new Set([
  'password',
  'authorization',
  'auth',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
]);

const nowMs =
  typeof performance !== 'undefined' && performance?.now
    ? (): DOMHighResTimeStamp => performance.now()
    : (): number => Date.now();

export class SystemLogger {
  private base: LoggerContext;
  private redact: Set<string>;
  private dims: Record<string, string>;
  private metricNs: string;

  constructor(opts: SystemLoggerOptions, initial: LoggerContext = {}) {
    this.base = {
      service: opts.service,
      env: opts.env,
      ...initial,
    };
    this.redact = new Set([
      ...(opts.redactKeys ?? []),
      ...Array.from(DEFAULT_REDACTIONS),
    ]);
    this.dims = opts.defaultDimensions ?? {
      service: opts.service,
      env: opts.env,
    };
    this.metricNs = opts.metricNamespace ?? 'App/Service';
  }

  /** Create a child logger with more context (e.g., per request). */
  child(extra: LoggerContext): SystemLogger {
    return new SystemLogger(
      {
        service: String(this.base.service),
        env: String(this.base.env),
        redactKeys: Array.from(this.redact),
        defaultDimensions: { ...this.dims },
        metricNamespace: this.metricNs,
      },
      { ...this.base, ...extra },
    );
  }

  setContext(extra: LoggerContext): void {
    this.base = { ...this.base, ...extra };
  }

  /** Get the current trace ID for this logger instance */
  getTraceId(): string | undefined {
    return typeof this.base.traceId === 'string' ? this.base.traceId : undefined;
  }

  // -------- Public API: levels --------

  debug(msg: string, fields: Record<string, unknown> = {}): void {
    this.write('debug', msg, fields);
  }
  info(msg: string, fields: Record<string, unknown> = {}): void {
    this.write('info', msg, fields);
  }
  warn(msg: string, fields: Record<string, unknown> = {}): void {
    this.write('warn', msg, fields);
  }
  error(
    err: unknown,
    msg = 'Unhandled error',
    fields: Record<string, unknown> = {},
  ): void {
    const e = this.normalizeError(err);
    this.write('error', msg, { ...fields, error: e });
  }

  /** Domain events you'll graph/query (e.g., successful_dispatch) */
  event(name: string, fields: Record<string, unknown> = {}): void {
    this.info(`event:${name}`, { event: name, ...fields });
  }

  consoleLogDevOnly(
    level: LogLevel,
    message: string,
    additionalData?: Record<string, unknown>,
  ): void {
    if (process.env.NODE_ENV !== 'development') return;

    const logData = additionalData ? { message, ...additionalData } : message;

    switch (level) {
      case 'error':
        console.error(logData);
        break;
      case 'warn':
        console.warn(logData);
        break;
      case 'debug':
        console.debug(logData);
        break;
      case 'info':
      default:
        console.log(logData);
        break;
    }
  }

  // -------- Timers / Counters (EMF) --------

  /** Emit a count metric to CloudWatch via EMF (dimensions from logger context). */
  metricCount(
    name: string,
    count = 1,
    extraDims: Record<string, string> = {},
  ): void {
    this.emitEMF([{ Name: name, Unit: 'Count' }], { [name]: count }, extraDims);
  }

  /** Emit a timing/latency metric in milliseconds via EMF. */
  metricTiming(
    name: string,
    ms: number,
    extraDims: Record<string, string> = {},
  ): void {
    this.emitEMF(
      [{ Name: name, Unit: 'Milliseconds' }],
      { [name]: ms },
      extraDims,
    );
  }

  /** Time a function and report duration under metric `name`. */
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    extraDims: Record<string, string> = {},
  ): Promise<T> {
    const start = nowMs();
    try {
      const res = await fn();
      const dur = nowMs() - start;
      this.metricTiming(name, dur, extraDims);
      return res;
    } catch (err) {
      const dur = nowMs() - start;
      this.metricTiming(name, dur, { ...extraDims, outcome: 'error' });
      this.error(err, `${name} failed`, { duration_ms: Math.round(dur) });
      throw err;
    }
  }

  /** Create a manual timer; call the returned done() when finished. */
  startTimer(
    name: string,
    extraDims: Record<string, string> = {},
  ): (moreDims?: Record<string, string>) => number {
    const start = nowMs();
    return (moreDims: Record<string, string> = {}): number => {
      const dur = nowMs() - start;
      this.metricTiming(name, dur, { ...extraDims, ...moreDims });
      return dur;
    };
  }

  // -------- Internals --------

  private write(
    level: LogLevel,
    msg: string,
    fields: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();
    const payload = {
      ts: now,
      level,
      msg,
      ...this.base,
      ...this.redactFields(fields),
    };
    // Ensure stable key order for readability (optional)
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  private redactFields(obj: Record<string, unknown>): Record<string, unknown> {
    const seen = new WeakSet<object>();
    const redactor = (k: string, v: unknown): unknown => {
      if (v && typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (this.redact.has(k.toLowerCase())) {
        return '[REDACTED]';
      }
      return v;
    };
    // shallow clone + replacer for nested
    return JSON.parse(JSON.stringify(obj, redactor)) as Record<string, unknown>;
  }

  private normalizeError(err: unknown): NormalizedError {
    if (err instanceof Error) {
      const errorWithExtras = err as Error & {
        code?: string | number;
        cause?: unknown;
      };

      const normalizedError: NormalizedError = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };

      if (errorWithExtras.code !== undefined) {
        normalizedError.code = errorWithExtras.code;
      }

      if (errorWithExtras.cause instanceof Error) {
        normalizedError.cause = {
          name: errorWithExtras.cause.name,
          message: errorWithExtras.cause.message,
          stack: errorWithExtras.cause.stack,
        };
      }

      return normalizedError;
    }
    return {
      name: 'UnknownError',
      message: String(err),
    };
  }

  /**
   * Emit an EMF (Embedded Metric Format) log block that CloudWatch
   * automatically converts into custom metrics.
   *
   * Example outcome:
   *   Namespace: this.metricNs (e.g., "Materialize/Service")
   *   Dimensions: (service, env, route, …)
   *   Metrics emitted: counts, latency, etc.
   */
  private emitEMF(
    metricDefs: EMFMetric[],
    metricValues: Record<string, number>,
    extraDims: Record<string, string>,
  ): void {
    const dims = this.buildDimensions(extraDims);
    const emf: EMFStructure = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: this.metricNs,
            Dimensions: [Object.keys(dims)],
            Metrics: metricDefs,
          },
        ],
      },
      ...dims,
      ...metricValues,
    };
    process.stdout.write(JSON.stringify(emf) + '\n');
  }

  /** Build dimension object from base context + extras, dropping undefineds and big strings. */
  private buildDimensions(
    extraDims: Record<string, string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const ordered: (keyof LoggerContext)[] = [
      'service',
      'env',
      'route',
      'method',
    ];
    for (const k of ordered) {
      const v = this.base[k];
      if (typeof v === 'string' && v.length <= 300) out[k] = v;
    }
    return { ...this.dims, ...out, ...extraDims };
  }
}

// ---- Tiny helpers you might use in your server middleware ----

export function genRequestIds(
  headers: Record<string, string | string[] | undefined>,
): { requestId: string; traceId: string } {
  const fromHeader = (name: string): string => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  };

  const incoming = fromHeader('x-request-id') || cryptoRandomId();
  const trace = fromHeader('x-trace-id') || incoming;

  return { requestId: incoming, traceId: trace };
}

function cryptoRandomId(): string {
  // Not cryptographically strong across all Node versions; good enough for correlation.
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}
