import path from "path";

export interface CommandValidationResult {
  allowed: boolean;
  reason?: string;
  nextCwd?: string;
}

export class TerminalCommandValidator {
  private readonly allowedRoot: string;

  constructor(allowedRoot: string) {
    this.allowedRoot = allowedRoot;
  }

  public isPathInsideAllowedRoot(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const allowedWithSep = this.allowedRoot.endsWith(path.sep)
      ? this.allowedRoot
      : `${this.allowedRoot}${path.sep}`;
    return (
      normalizedPath === this.allowedRoot ||
      normalizedPath.startsWith(allowedWithSep)
    );
  }

  public normalizePathToAllowedRoot(rawPath: string): {
    resolvedPath: string;
    withinRoot: boolean;
  } {
    const resolvedPath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(this.allowedRoot, rawPath);

    return {
      resolvedPath,
      withinRoot: this.isPathInsideAllowedRoot(resolvedPath),
    };
  }

  public validateCommandLine(
    trimmedLine: string,
    currentCwd: string,
  ): CommandValidationResult {
    if (!trimmedLine) {
      return { allowed: true };
    }

    const hasForbiddenChaining = (
      value: string,
      allowDoubleAmpersand = false,
    ): boolean => {
      const chainingTokens = [
        allowDoubleAmpersand ? null : "&&",
        "||",
        "|",
        ";",
        "`",
        "$(",
        "${",
        ">>",
        ">",
        "<",
      ].filter(Boolean) as string[];

      return chainingTokens.some((token) => value.includes(token));
    };

    const isEnvAssignment = (token: string): boolean =>
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);

    const dangerousPatterns = [
      {
        pattern: /^\s*(sudo|su)\b/i,
        reason: "Privilege escalation not allowed",
      },
      { pattern: /^\s*chroot\b/i, reason: "chroot not allowed" },
      {
        pattern: /^\s*(docker|podman|kubectl)\b/i,
        reason: "Container commands not allowed",
      },
      {
        pattern: /^\s*rm\s+-rf\s+(\/|~)/i,
        reason: "Destructive system commands not allowed",
      },
      {
        pattern: /^\s*(ps|top|htop|pgrep|pkill|kill\s+-9|killall)\b/i,
        reason: "Process inspection/manipulation not allowed",
      },
      {
        pattern: /^\s*(systemctl|service|journalctl)\b/i,
        reason: "System service commands not allowed",
      },
      {
        pattern: /^\s*(mount|umount|fdisk|mkfs)\b/i,
        reason: "Filesystem commands not allowed",
      },
      {
        pattern: /^\s*(useradd|userdel|usermod|passwd)\b/i,
        reason: "User management not allowed",
      },
      {
        pattern: /^\s*(iptables|ufw|firewall)\b/i,
        reason: "Firewall commands not allowed",
      },
      {
        pattern: /^\s*(ssh|scp|sftp|rsync)/i,
        reason: "Remote access commands not allowed",
      },
      {
        pattern: /^\s*(wget|curl).*\s+(http|https|ftp):\/\//i,
        reason: "External network access not allowed",
      },
      { pattern: /\/etc\//i, reason: "Access to /etc/ not allowed" },
      { pattern: /\/proc\//i, reason: "Access to /proc/ not allowed" },
      { pattern: /\/sys\//i, reason: "Access to /sys/ not allowed" },
      { pattern: /\/root\//i, reason: "Access to /root/ not allowed" },
      {
        pattern: /\/home\/(?!materialize-user)/i,
        reason: "Access to other users' home directories not allowed",
      },
    ];

    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(trimmedLine)) {
        return { allowed: false, reason };
      }
    }

    const validateCommandTokens = (
      tokens: string[],
      cwdForResolution: string,
    ): CommandValidationResult => {
      if (tokens.length === 0) {
        return {
          allowed: false,
          reason: "Command not permitted. No executable provided",
        };
      }

      const command = tokens[0].toLowerCase();
      const forbiddenSubcommands = new Set([
        "ps",
        "top",
        "htop",
        "pgrep",
        "pkill",
        "kill",
        "killall",
        "bash",
        "zsh",
        "sh",
        "fish",
        "man",
        "chmod",
        "chown",
        "scp",
        "ssh",
      ]);

      for (const token of tokens.slice(1)) {
        if (forbiddenSubcommands.has(token.toLowerCase())) {
          return {
            allowed: false,
            reason: "Subcommand is not permitted within the sandbox",
          };
        }

        if (path.isAbsolute(token)) {
          const { withinRoot } = this.normalizePathToAllowedRoot(token);
          if (!withinRoot) {
            return {
              allowed: false,
              reason: `Paths must stay within ${this.allowedRoot}`,
            };
          }
        }

        if (token.includes("..")) {
          return {
            allowed: false,
            reason: "Relative paths cannot traverse parent directories",
          };
        }
      }

      const allowedCommands = new Set([
        "pwd",
        "ls",
        "cd",
        "npm",
        "npx",
        "bun",
        "bunx",
        "yarn",
        "pnpm",
        "expo",
        "cat",
      ]);

      if (!allowedCommands.has(command)) {
        return {
          allowed: false,
          reason:
            "Command not permitted. Allowed commands: npm/npx/bun/bunx/yarn/pnpm/expo/ls/pwd/cd",
        };
      }

      if (command === "pwd") {
        if (tokens.length > 1) {
          return {
            allowed: false,
            reason: "pwd does not accept arguments here",
          };
        }
        return { allowed: true };
      }

      if (command === "ls") {
        if (tokens.length === 1) {
          return { allowed: true };
        }

        if (tokens.length > 2) {
          return { allowed: false, reason: "ls supports at most one path" };
        }

        if (tokens[1].startsWith("-")) {
          return { allowed: false, reason: "ls flags are not permitted" };
        }

        const targetPath = tokens[1];
        const { withinRoot } = this.normalizePathToAllowedRoot(targetPath);
        if (!withinRoot) {
          return {
            allowed: false,
            reason: `ls path must stay within ${this.allowedRoot}`,
          };
        }
        return { allowed: true };
      }

      if (command === "cd") {
        if (tokens.length < 2) {
          return { allowed: false, reason: "cd requires a target path" };
        }

        if (tokens.length > 2) {
          return {
            allowed: false,
            reason: "cd only accepts a single target path",
          };
        }

        const targetPath = tokens[1];
        const resolvedTarget = path.isAbsolute(targetPath)
          ? path.resolve(targetPath)
          : path.resolve(cwdForResolution, targetPath);

        const { withinRoot } = this.normalizePathToAllowedRoot(resolvedTarget);
        if (!withinRoot) {
          return {
            allowed: false,
            reason: `cd target must stay within ${this.allowedRoot}`,
          };
        }
        return { allowed: true, nextCwd: resolvedTarget };
      }

      return { allowed: true };
    };

    const validateSimpleCommand = (
      commandString: string,
      cwdForResolution: string,
    ): CommandValidationResult => {
      if (hasForbiddenChaining(commandString)) {
        return { allowed: false, reason: "Command chaining is not allowed" };
      }

      const tokens = commandString.split(/\s+/).filter(Boolean);
      let idx = 0;
      while (idx < tokens.length && isEnvAssignment(tokens[idx])) {
        idx += 1;
      }

      const envTokens = tokens.slice(0, idx);
      if (
        envTokens.some(
          (token) =>
            token.includes("..") ||
            token.includes(";") ||
            token.includes("|") ||
            token.includes("`"),
        )
      ) {
        return {
          allowed: false,
          reason: "Environment assignments contain disallowed characters",
        };
      }

      const commandTokens = tokens.slice(idx);
      return validateCommandTokens(commandTokens, cwdForResolution);
    };

    const cdChainMatch = trimmedLine.match(/^\s*cd\s+(.+?)\s*&&\s*(.+)$/i);
    if (cdChainMatch) {
      const targetPath = cdChainMatch[1];
      const resolvedTarget = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(currentCwd, targetPath);
      const { withinRoot } = this.normalizePathToAllowedRoot(resolvedTarget);
      if (!withinRoot || targetPath.includes("..")) {
        return {
          allowed: false,
          reason: `cd target must stay within ${this.allowedRoot}`,
        };
      }

      const remainder = cdChainMatch[2];
      if (remainder.includes("&&") || hasForbiddenChaining(remainder, true)) {
        return {
          allowed: false,
          reason: "Only a single command may follow cd",
        };
      }

      const remainderValidation = validateSimpleCommand(
        remainder,
        resolvedTarget,
      );
      if (remainderValidation.allowed) {
        remainderValidation.nextCwd = resolvedTarget;
      }
      return remainderValidation;
    }

    return validateSimpleCommand(trimmedLine, currentCwd);
  }

  public processAndValidateInput(
    sessionId: string,
    sessionCwd: string,
    input: string,
    currentBuffer: string,
    updateSessionCwd: (newCwd: string) => void,
  ): { outputToWrite: string; newBuffer: string; error?: Error } {
    const ctrlC = "\x03";
    const backspace = "\x7f";
    const normalizedInput = input.replace(/\r/g, "\n");
    let buffer = currentBuffer;
    let outputToWrite = "";

    const throwValidationError = (reason: string): Error => {
      const err = new Error(reason);
      err.name = "TerminalInputValidationError";
      return err;
    };

    for (const char of normalizedInput) {
      if (char === ctrlC) {
        buffer = "";
        outputToWrite += char;
        continue;
      }

      if (char === backspace) {
        buffer = buffer.slice(0, -1);
        outputToWrite += char;
        continue;
      }

      if (char === "\n") {
        const lineToValidate = buffer.trim();
        if (lineToValidate) {
          const validation = this.validateCommandLine(
            lineToValidate,
            sessionCwd,
          );
          if (!validation.allowed) {
            return {
              outputToWrite: "",
              newBuffer: "",
              error: throwValidationError(
                validation.reason ?? "Terminal input rejected by safety policy",
              ),
            };
          }

          if (validation.nextCwd) {
            updateSessionCwd(validation.nextCwd);
          }
        }
        buffer = "";
        outputToWrite += char;
        continue;
      }

      buffer += char;
      if (buffer.length > 5000) {
        return {
          outputToWrite: "",
          newBuffer: "",
          error: throwValidationError("Input line too long"),
        };
      }
      outputToWrite += char;
    }

    return { outputToWrite, newBuffer: buffer };
  }
}
