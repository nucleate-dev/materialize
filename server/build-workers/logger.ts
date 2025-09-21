export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "simple" | "json" | "compact";

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  format: LogFormat;
  includeTimestamp: boolean;
  includeLevel: boolean;
  namespace?: string;
}

class Logger {
  private config: LoggerConfig;

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  private readonly reset = "\x1b[0m";

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      enabled:
        process.env.DEBUG === "true" || process.env.NODE_ENV === "development",
      level: (process.env.LOG_LEVEL as LogLevel) || "debug",
      format: (process.env.LOG_FORMAT as LogFormat) || "simple",
      includeTimestamp: true,
      includeLevel: true,
      namespace: undefined,
      ...config,
    };
  }

  configure(updates: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  child(namespace: string): Logger {
    return new Logger({
      ...this.config,
      namespace: this.config.namespace
        ? `${this.config.namespace}:${namespace}`
        : namespace,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return this.levels[level] >= this.levels[this.config.level];
  }

  private formatMessage(level: LogLevel, args: unknown[]): string {
    const timestamp = this.config.includeTimestamp
      ? new Date().toISOString()
      : null;
    const levelStr = this.config.includeLevel ? level.toUpperCase() : null;
    const namespace = this.config.namespace;

    switch (this.config.format) {
      case "json":
        return JSON.stringify({
          ...(timestamp && { timestamp }),
          ...(levelStr && { level: levelStr }),
          ...(namespace && { namespace }),
          message: args.length === 1 ? args[0] : args,
        });

      case "compact":
        const parts = [
          ...(timestamp ? [timestamp.substring(11, 23)] : []),
          ...(levelStr ? [levelStr.charAt(0)] : []),
          ...(namespace ? [namespace] : []),
        ];
        return parts.length > 0
          ? `[${parts.join("|")}] ${args.join(" ")}`
          : args.join(" ");

      case "simple":
      default:
        const prefix = [
          ...(timestamp ? [`[${timestamp}]`] : []),
          ...(levelStr ? [`[${levelStr}]`] : []),
          ...(namespace ? [`[${namespace}]`] : []),
        ].join(" ");

        return prefix ? `${prefix} ${args.join(" ")}` : args.join(" ");
    }
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const message = this.formatMessage(level, args);

    if (this.config.format === "json") {
      console.log(message);
      return;
    }

    switch (level) {
      case "error":
        console.error(message);
        break;
      case "warn":
        console.warn(message);
        break;
      case "debug":
        console.debug(message);
        break;
      case "info":
      default:
        console.log(message);
        break;
    }
  }

  debug(...args: unknown[]): void {
    this.log("debug", ...args);
  }

  info(...args: unknown[]): void {
    this.log("info", ...args);
  }

  warn(...args: unknown[]): void {
    this.log("warn", ...args);
  }

  error(...args: unknown[]): void {
    this.log("error", ...args);
  }
}

export const logger = new Logger();

export function customlog(logType: LogLevel, ...logArgs: unknown[]): void {
  logger[logType](...logArgs);
}

export { Logger };
