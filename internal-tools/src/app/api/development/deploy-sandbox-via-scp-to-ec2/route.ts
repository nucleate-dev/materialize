import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const SERVER_DIR = path.join(REPO_ROOT, "server");
const BUILD_WORKERS_DIR = path.join(SERVER_DIR, "build-workers");
const DEPLOY_SCRIPT = path.join(
  SERVER_DIR,
  "scripts",
  "deploy-build-workers-for-dev.js",
);

const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
]);

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  hasChanges?: boolean;
};

function normalizeRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join(path.posix.sep);
}

function parseGitStatusOutput(output: string) {
  const changed = new Set<string>();

  for (const rawLine of output.split("\n")) {
    if (!rawLine) {
      continue;
    }

    if (rawLine.length < 4) {
      continue;
    }

    let filePath = rawLine.slice(3).trim();
    if (!filePath) {
      continue;
    }

    if (filePath.includes(" -> ")) {
      const parts = filePath.split(" -> ");
      filePath = parts[parts.length - 1] ?? filePath;
    }

    const absolutePath = path.resolve(REPO_ROOT, filePath);
    if (!absolutePath.startsWith(BUILD_WORKERS_DIR)) {
      continue;
    }

    const relativePath = path.relative(BUILD_WORKERS_DIR, absolutePath);
    if (!relativePath || relativePath.startsWith("..")) {
      continue;
    }

    changed.add(normalizeRelativePath(relativePath));
  }

  return Array.from(changed).sort((a, b) => a.localeCompare(b));
}

async function getGitChangedPaths() {
  return new Promise<string[]>((resolve, reject) => {
    const child = spawn(
      "git",
      ["status", "--porcelain", "--", "server/build-workers"],
      {
        cwd: REPO_ROOT,
        env: process.env,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || "Failed to retrieve git status for build-workers",
          ),
        );
        return;
      }

      try {
        resolve(parseGitStatusOutput(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function readDirectory(
  directory: string,
  changedPaths: Set<string>,
): Promise<FileNode[]> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const results: FileNode[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(
      path.relative(BUILD_WORKERS_DIR, fullPath),
    );

    if (entry.isDirectory()) {
      const children = await readDirectory(fullPath, changedPaths);
      const hasChanges = children.some((child) => child.hasChanges);
      results.push({
        name: entry.name,
        path: relativePath,
        type: "directory",
        children,
        hasChanges,
      });
    } else {
      const hasChanges = changedPaths.has(relativePath);
      results.push({
        name: entry.name,
        path: relativePath,
        type: "file",
        hasChanges,
      });
    }
  }

  results.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === "directory" ? -1 : 1;
  });

  return results;
}

export async function GET() {
  try {
    await fsp.access(BUILD_WORKERS_DIR, fs.constants.R_OK);
  } catch (error) {
    return NextResponse.json(
      { error: `Build workers directory not accessible: ${String(error)}` },
      { status: 500 },
    );
  }

  try {
    let gitChangedPaths: string[] = [];
    try {
      gitChangedPaths = await getGitChangedPaths();
    } catch {
      gitChangedPaths = [];
    }

    const changedSet = new Set(gitChangedPaths);
    const files = await readDirectory(BUILD_WORKERS_DIR, changedSet);
    return NextResponse.json({ files, changedPaths: gitChangedPaths });
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Failed to read build workers files",
      },
      { status: 500 },
    );
  }
}

function runDeployScriptWithStreaming(
  paths: string[],
  onData: (data: string) => void,
) {
  return new Promise<{
    code: number | null;
    success: boolean;
  }>((resolve, reject) => {
    if (!fs.existsSync(DEPLOY_SCRIPT)) {
      reject(new Error(`Deploy script not found at ${DEPLOY_SCRIPT}`));
      return;
    }

    const child = spawn("node", [DEPLOY_SCRIPT, ...paths], {
      cwd: SERVER_DIR,
      env: process.env,
    });

    child.stdout.on("data", (data) => {
      onData(data.toString());
    });

    child.stderr.on("data", (data) => {
      onData(data.toString());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, success: code === 0 });
    });
  });
}

export async function POST(request: NextRequest) {
  let payload: { paths?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    // ignore empty body
  }

  const paths = Array.isArray(payload.paths)
    ? payload.paths.map((item) => String(item))
    : [];

  const normalizedPaths = paths.map((relativePath) =>
    path.join("build-workers", relativePath),
  );

  // Create a readable stream for streaming the deploy output
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runDeployScriptWithStreaming(
          normalizedPaths,
          (data) => {
            // Send each chunk of output as it arrives
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "data", data }) + "\n"),
            );
          },
        );

        // Send final status
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "done",
              success: result.success,
              code: result.code,
            }) + "\n",
          ),
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              error:
                (error as Error).message || "Failed to execute deploy script",
            }) + "\n",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
