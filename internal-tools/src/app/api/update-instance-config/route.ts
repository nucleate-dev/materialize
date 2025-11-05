import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { publicDns, publicIpv4 } = await request.json();

    if (!publicDns || !publicIpv4) {
      return NextResponse.json(
        { error: "Missing publicDns or publicIpv4" },
        { status: 400 },
      );
    }

    const projectRoot = path.resolve(process.cwd(), "..");
    const results: { file: string; success: boolean; error?: string }[] = [];

    // 1. Update server/scripts/.env
    try {
      const scriptsEnvPath = path.join(projectRoot, "server/scripts/.env");
      let scriptsEnvContent = "";

      // Read existing content if file exists
      if (fs.existsSync(scriptsEnvPath)) {
        scriptsEnvContent = fs.readFileSync(scriptsEnvPath, "utf-8");
      }

      // Replace or add HOST line
      if (scriptsEnvContent.includes("HOST=")) {
        scriptsEnvContent = scriptsEnvContent.replace(
          /HOST=.*/,
          `HOST=${publicDns}`,
        );
      } else {
        // Add HOST if it doesn't exist
        if (scriptsEnvContent && !scriptsEnvContent.endsWith("\n")) {
          scriptsEnvContent += "\n";
        }
        scriptsEnvContent += `# EC2 instance configuration for deployment scripts\nHOST=${publicDns}\n`;
      }

      fs.writeFileSync(scriptsEnvPath, scriptsEnvContent, "utf-8");
      results.push({
        file: "server/scripts/.env",
        success: true,
      });
    } catch (error) {
      results.push({
        file: "server/scripts/.env",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 2. Update web-application/.env
    try {
      const webEnvPath = path.join(projectRoot, "web-application/.env");
      let webEnvContent = fs.readFileSync(webEnvPath, "utf-8");

      // Replace NEXT_PUBLIC_SERVER_ENDPOINT
      webEnvContent = webEnvContent.replace(
        /NEXT_PUBLIC_SERVER_ENDPOINT=.*/,
        `NEXT_PUBLIC_SERVER_ENDPOINT=http://${publicIpv4}:3000`,
      );

      fs.writeFileSync(webEnvPath, webEnvContent, "utf-8");
      results.push({
        file: "web-application/.env",
        success: true,
      });
    } catch (error) {
      results.push({
        file: "web-application/.env",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 3. Update internal-tools/.env
    try {
      const internalEnvPath = path.join(projectRoot, "internal-tools/.env");
      let internalEnvContent = fs.readFileSync(internalEnvPath, "utf-8");

      // Replace NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT
      internalEnvContent = internalEnvContent.replace(
        /NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT=.*/,
        `NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT=http://${publicIpv4}:3000`,
      );

      // Replace NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT
      internalEnvContent = internalEnvContent.replace(
        /NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT=.*/,
        `NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT=http://${publicIpv4}:3002`,
      );

      fs.writeFileSync(internalEnvPath, internalEnvContent, "utf-8");
      results.push({
        file: "internal-tools/.env",
        success: true,
      });
    } catch (error) {
      results.push({
        file: "internal-tools/.env",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const allSuccess = results.every((r) => r.success);

    return NextResponse.json(
      {
        success: allSuccess,
        results,
        message: allSuccess
          ? "All files updated successfully"
          : "Some files failed to update",
      },
      { status: allSuccess ? 200 : 207 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
