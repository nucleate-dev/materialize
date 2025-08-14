const DEBUG_ENABLED = true; //process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

export function customlog(
  logType: "info" | "warn" | "error" | "debug",
  ...logArgs: any[]
): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${logType.toUpperCase()}]`;

  switch (logType) {
    case "error":
      console.error(prefix, ...logArgs);
      break;
    case "warn":
      console.warn(prefix, ...logArgs);
      break;
    case "debug":
      console.debug(prefix, ...logArgs);
      break;
    case "info":
    default:
      console.log(prefix, ...logArgs);
      break;
  }
}
