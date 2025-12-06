import { SystemLogger } from "../../loggers/SystemLogger";
import { TerminalSession } from "../terminals/TerminalService";

export async function npmInstallDependenciesWithListeners(
  projectDir: string,
  log2: SystemLogger,
  terminalSession: TerminalSession,
): Promise<void> {
  log2.consoleLogDevOnly(
    "info",
    "Installing dependencies using terminal session",
  );

  return new Promise((resolve, reject) => {
    let stdout = "";
    let installComplete = false;

    const timeout = setTimeout(() => {
      if (!installComplete) {
        installComplete = true;
        const error = "npm install timed out after 5 minutes";
        log2.error(new Error(error), "Install dependencies timeout");
        reject(new Error(error));
      }
    }, 300000); // 5 minute timeout

    const cleanup = (): void => {
      disposable.dispose();
    };

    const processOutput = (chunk: string): void => {
      const output = chunk.toString();
      stdout += output;

      const hasError =
        output.includes("npm ERR!") || output.includes("ERESOLVE");

      const hasAddedPackages =
        output.includes("added") && output.includes("packages");

      // Handle cases where everything is already installed
      // Examples:
      //   "up to date"
      //   "up to date, audited 123 packages in 2s"
      const hasUpToDate =
        /up to date[,\s]/i.test(output) ||
        /audited \d+ packages in/i.test(output);

      // Check for errors first so we don't accidentally mark a failure as success
      if (hasError && !installComplete) {
        installComplete = true;
        clearTimeout(timeout);
        const error = `npm install failed: ${output}`;
        log2.error(new Error(error), "Install dependencies failed", {
          stdout,
        });
        cleanup();
        reject(new Error(error));
        return;
      }

      // Check for successful completion
      if ((hasAddedPackages || hasUpToDate) && !installComplete) {
        installComplete = true;
        clearTimeout(timeout);
        log2.consoleLogDevOnly("info", "Dependencies installed successfully");
        cleanup();
        resolve();
      }
    };

    // Set up listener on the PTY output
    const disposable = terminalSession.pty.onData(processOutput);

    // Build the command to run in the terminal
    const command = `cd ${projectDir} && NODE_OPTIONS="--max-old-space-size=2048" npm install --prefer-offline --no-audit --no-fund\n`;

    log2.consoleLogDevOnly("info", "Sending npm install command to terminal", {
      command: command.trim(),
      projectDir,
    });

    // Send the command to the terminal
    terminalSession.pty.write(command);

    // Wait a bit for command to execute and check for immediate errors
    setTimeout(() => {
      if (!installComplete) {
        log2.debug("npm install in progress...");
      }
    }, 5000);
  });
}
