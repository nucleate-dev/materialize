import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const SERVER_DIR = path.join(REPO_ROOT, "server");
const CONTROL_PLANE_DIR = path.join(SERVER_DIR, "control-plane");
const DEPLOY_SCRIPT = path.join(
  SERVER_DIR,
  "scripts",
  "deploy-control-plane-for-dev.js"
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
};

async function readDirectory(directory: string): Promise<FileNode[]> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const results: FileNode[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(CONTROL_PLANE_DIR, fullPath);

    if (entry.isDirectory()) {
      const children = await readDirectory(fullPath);
      results.push({
        name: entry.name,
        path: relativePath,
        type: "directory",
        children,
      });
    } else {
      results.push({
        name: entry.name,
        path: relativePath,
        type: "file",
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
    await fsp.access(CONTROL_PLANE_DIR, fs.constants.R_OK);
  } catch (error) {
    return NextResponse.json(
      { error: `Control plane directory not accessible: ${String(error)}` },
      { status: 500 }
    );
  }

  try {
    const files = await readDirectory(CONTROL_PLANE_DIR);
    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to read control plane files" },
      { status: 500 }
    );
  }
}

function runDeployScript(paths: string[] = []) {
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    if (!fs.existsSync(DEPLOY_SCRIPT)) {
      reject(new Error(`Deploy script not found at ${DEPLOY_SCRIPT}`));
      return;
    }

    const child = spawn("node", [DEPLOY_SCRIPT, ...paths], {
      cwd: SERVER_DIR,
      env: process.env,
    });

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
      resolve({ code, stdout, stderr });
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
    path.join("control-plane", relativePath)
  );

  try {
    const { code, stdout, stderr } = await runDeployScript(normalizedPaths);
    const output = `${stdout}${stderr}`.trim();

    if (code === 0) {
      return NextResponse.json({ success: true, output });
    }

    return NextResponse.json(
      { success: false, output, error: "Deploy script exited with an error" },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to execute deploy script",
      },
      { status: 500 }
    );
  }
}
