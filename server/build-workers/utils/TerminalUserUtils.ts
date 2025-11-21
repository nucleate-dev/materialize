import { execFile } from "child_process";
import { readFileSync } from "fs";
import fs from "fs/promises";
import { promisify } from "util";
import { SystemLogger } from "../loggers/SystemLogger.js";

const execFileAsync = promisify(execFile);

export interface TerminalUserIdentity {
  username: string;
  uid: number;
  gid: number;
  homeDir: string;
}

export function resolveTerminalUserIdentity(
  logger: SystemLogger,
  username = process.env.TERMINAL_USER ?? "materialize-user",
  groupOverride = process.env.TERMINAL_GROUP,
): TerminalUserIdentity | null {
  try {
    const passwdContent = readFileSync("/etc/passwd", "utf8");
    const userEntry = passwdContent
      .split("\n")
      .find((line) => line.startsWith(`${username}:`));

    if (!userEntry) {
      logger.warn("Terminal user not found in /etc/passwd", {
        username,
      });
      return null;
    }

    const [name, , uidRaw, gidRaw, , homeDirRaw] = userEntry.split(":");
    const uid = Number(uidRaw);
    let gid = Number(gidRaw);
    const homeDir = homeDirRaw || "/tmp/materialize-dev-server";

    if (!Number.isFinite(uid) || !Number.isFinite(gid)) {
      logger.warn("Invalid UID/GID for terminal user", {
        username,
        uidRaw,
        gidRaw,
      });
      return null;
    }

    if (groupOverride) {
      const gidFromGroup = lookupGroupId(groupOverride);
      if (gidFromGroup !== null) {
        gid = gidFromGroup;
      } else {
        logger.warn("Failed to resolve override group for terminal user", {
          groupOverride,
        });
      }
    }

    return {
      username: name,
      uid,
      gid,
      homeDir,
    };
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to resolve terminal user identity",
      { username, groupOverride },
    );
    return null;
  }
}

export async function ensureWorkspacePermissions(
  dir: string,
  identity: TerminalUserIdentity | null,
  logger: SystemLogger,
): Promise<void> {
  if (!identity) {
    logger.warn("Workspace permission enforcement skipped - missing identity", {
      dir,
    });
    return;
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.chown(dir, identity.uid, identity.gid);
    await fs.chmod(dir, 0o770);
  } catch (error) {
    logger.warn("Failed to set workspace ownership", {
      dir,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  await applyAcl(dir, identity.username, logger);
}

async function applyAcl(
  dir: string,
  username: string,
  logger: SystemLogger,
): Promise<void> {
  await runAclCommand(["-m", `u:${username}:rwx`, dir], logger);
  await runAclCommand(["-d", "-m", `u:${username}:rwx`, dir], logger);
  await runAclCommand(["-d", "-m", "o::---", dir], logger);
}

async function runAclCommand(
  args: string[],
  logger: SystemLogger,
): Promise<void> {
  try {
    await execFileAsync("setfacl", args);
  } catch (error) {
    logger.warn("Failed to apply ACL", {
      args: args.join(" "),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function lookupGroupId(groupName: string): number | null {
  try {
    const groupContent = readFileSync("/etc/group", "utf8");
    const groupEntry = groupContent
      .split("\n")
      .find((line) => line.startsWith(`${groupName}:`));
    if (!groupEntry) {
      return null;
    }
    const [, , gidRaw] = groupEntry.split(":");
    const gid = Number(gidRaw);
    return Number.isFinite(gid) ? gid : null;
  } catch {
    return null;
  }
}
