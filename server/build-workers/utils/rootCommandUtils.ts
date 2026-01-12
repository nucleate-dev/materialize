import { spawn } from "child_process";

type RunAsRootOptions = {
  cwd?: string;
  timeoutMs?: number;
};

/**
 * Run a system command as the root user using child_process.spawn.
 * Ensures we can access paths outside the restricted terminal workspace.
 */
export async function runCommandAsRoot(
  command: string,
  args: string[],
  options: RunAsRootOptions = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: "inherit",
    });

    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);
    }

    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(
            `Command timed out after ${options.timeoutMs}ms: ${command} ${args.join(" ")}`,
          ),
        );
        return;
      }
      if (signal) {
        reject(new Error(`Command was terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}
