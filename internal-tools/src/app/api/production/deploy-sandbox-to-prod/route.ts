import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const SERVER_DIR = path.join(REPO_ROOT, "server");
const PUSH_TO_PROD_ECR_SCRIPT = path.join(SERVER_DIR, "push-to-prod-ecr.sh");

function runPushToProdECRScriptWithStreaming(
  onData: (data: string) => void
) {
  return new Promise<{
    code: number | null;
    success: boolean;
  }>((resolve, reject) => {
    if (!fs.existsSync(PUSH_TO_PROD_ECR_SCRIPT)) {
      reject(new Error(`Push to prod ECR script not found at ${PUSH_TO_PROD_ECR_SCRIPT}`));
      return;
    }

    const child = spawn("bash", [PUSH_TO_PROD_ECR_SCRIPT], {
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

export async function POST() {
  // Create a readable stream for streaming the script output
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runPushToProdECRScriptWithStreaming((data) => {
          // Send each chunk of output as it arrives
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "data", data }) + "\n")
          );
        });

        // Send final status
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "done",
              success: result.success,
              code: result.code,
            }) + "\n"
          )
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              error: (error as Error).message || "Failed to execute push-to-prod-ecr script",
            }) + "\n"
          )
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
