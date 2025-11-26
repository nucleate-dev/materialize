import { readFileSync } from "fs";
import { SystemLogger } from "../../loggers/SystemLogger.js";

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
