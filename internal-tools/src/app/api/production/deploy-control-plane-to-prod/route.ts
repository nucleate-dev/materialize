import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const CONTROL_PLANE_DIR = path.join(REPO_ROOT, "server", "control-plane");

function runNpmDeployProdWithStreaming(onData: (data: string) => void) {
  return new Promise<{
    code: number | null;
    success: boolean;
  }>((resolve, reject) => {
    if (!fs.existsSync(CONTROL_PLANE_DIR)) {
      reject(
        new Error(`Control plane directory not found at ${CONTROL_PLANE_DIR}`),
      );
      return;
    }

    const child = spawn("npm", ["run", "deploy:prod"], {
      cwd: CONTROL_PLANE_DIR,
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

export async function POST() {
  // Create a readable stream for streaming the script output
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runNpmDeployProdWithStreaming((data) => {
          // Send each chunk of output as it arrives
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "data", data }) + "\n"),
          );
        });

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
                (error as Error).message ||
                "Failed to execute npm run deploy:prod",
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
