import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "@/lib/internal-tools-auth";

interface EC2AcquisitionRequest {
  serverName: string;
}

interface EC2AcquisitionResponse {
  success: boolean;
  instanceId: string;
  state: string;
  message: string;
  timestamp: string;
}

interface ApiError {
  error: string;
  message: string;
  requiredHeaders?: string[];
  details?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { serverName }: EC2AcquisitionRequest = await request.json();

    if (!serverName || serverName.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "Server name is required",
        },
        { status: 400 }
      );
    }

    const { secretKey, serverEndpoint } = getInternalToolsConfig();
    const requestBody = JSON.stringify({ serverName: serverName.trim() });
    const headers = generateAuthHeaders(
      "POST",
      "/internal/dev-server/acquire-ec2",
      requestBody,
      secretKey
    );

    const url = `${serverEndpoint}/internal/dev-server/acquire-ec2`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: "Unknown Error",
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));

      return NextResponse.json(
        {
          error: errorData.error || "Request Failed",
          message: errorData.message || `Request failed with status ${response.status}`,
        },
        { status: response.status }
      );
    }

    const result: EC2AcquisitionResponse = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error acquiring EC2 instance:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}