"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Loader2, Terminal as TerminalIcon, Trash2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT ||
  "http://localhost:3002";

type TerminalSessionId = "dev-server" | "build" | "test";

interface TerminalState {
  ref: React.RefObject<HTMLDivElement>;
  xtermRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  status: "disconnected" | "connecting" | "connected";
}

export default function TerminalPage() {
  // Create refs for each terminal
  const devServerTerminal = useRef<HTMLDivElement>(null);
  const devServerXterm = useRef<Terminal | null>(null);
  const devServerFitAddon = useRef<FitAddon | null>(null);
  const devServerWs = useRef<WebSocket | null>(null);

  const buildTerminal = useRef<HTMLDivElement>(null);
  const buildXterm = useRef<Terminal | null>(null);
  const buildFitAddon = useRef<FitAddon | null>(null);
  const buildWs = useRef<WebSocket | null>(null);

  const testTerminal = useRef<HTMLDivElement>(null);
  const testXterm = useRef<Terminal | null>(null);
  const testFitAddon = useRef<FitAddon | null>(null);
  const testWs = useRef<WebSocket | null>(null);

  const [devServerStatus, setDevServerStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [buildStatus, setBuildStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [testStatus, setTestStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");

  // Initialize terminals on mount
  useEffect(() => {
    const initTerminal = (
      terminalRef: React.RefObject<HTMLDivElement>,
      xtermRef: React.MutableRefObject<Terminal | null>,
      fitAddonRef: React.MutableRefObject<FitAddon | null>,
    ) => {
      if (!terminalRef.current) return null;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
        },
        cols: 80,
        rows: 15,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);

      // Use setTimeout to allow the terminal to fully render before fitting
      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (err) {
          console.error("Failed to fit terminal:", err);
        }
      }, 0);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      return term;
    };

    // Initialize all three terminals
    const devTerm = initTerminal(
      devServerTerminal as React.RefObject<HTMLDivElement>,
      devServerXterm,
      devServerFitAddon,
    );
    const buildTerm = initTerminal(
      buildTerminal as React.RefObject<HTMLDivElement>,
      buildXterm,
      buildFitAddon,
    );
    const testTerm = initTerminal(
      testTerminal as React.RefObject<HTMLDivElement>,
      testXterm,
      testFitAddon,
    );

    // Handle window resize
    const handleResize = () => {
      [devServerFitAddon, buildFitAddon, testFitAddon].forEach(
        (fitAddonRef) => {
          if (fitAddonRef.current) {
            try {
              fitAddonRef.current.fit();
            } catch (err) {
              console.error("Failed to fit terminal on resize:", err);
            }
          }
        },
      );
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      devTerm?.dispose();
      buildTerm?.dispose();
      testTerm?.dispose();
    };
  }, []);

  const connectWebSocket = (
    sessionId: TerminalSessionId,
    xtermRef: React.MutableRefObject<Terminal | null>,
    wsRef: React.MutableRefObject<WebSocket | null>,
    setStatus: (status: "disconnected" | "connecting" | "connected") => void,
    baseUrl?: string,
  ) => {
    setStatus("connecting");

    const effectiveBaseUrl = baseUrl || API_BASE_URL;
    const wsUrl = effectiveBaseUrl.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/terminal/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setError(null);

      // Handle user input
      if (xtermRef.current) {
        xtermRef.current.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "input",
                data: data,
              }),
            );
          }
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.event === "output" && message.data?.chunk) {
          xtermRef.current?.write(message.data.chunk);
        } else if (message.event === "exit") {
          xtermRef.current?.writeln(
            `\r\n\x1b[33mProcess exited with code: ${message.data?.exitCode ?? "unknown"}\x1b[0m`,
          );
        } else if (message.event === "error") {
          setError(message.data?.error || "Terminal error occurred");
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setError(`WebSocket connection error for ${sessionId}`);
      setStatus("disconnected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      xtermRef.current?.writeln("\r\n\x1b[31mConnection closed\x1b[0m");
    };
  };

  const initializeDefaultTerminals = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = customBaseUrl.trim() || undefined;

      // Connect to dev-server terminal
      connectWebSocket(
        "dev-server",
        devServerXterm,
        devServerWs,
        setDevServerStatus,
        baseUrl,
      );

      // Connect to build terminal
      connectWebSocket("build", buildXterm, buildWs, setBuildStatus, baseUrl);

      // Connect to test terminal
      connectWebSocket("test", testXterm, testWs, setTestStatus, baseUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize terminals",
      );
    } finally {
      setLoading(false);
    }
  };

  const createNewSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = customBaseUrl.trim() || API_BASE_URL;

      const response = await fetch(`${baseUrl}/terminal/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "generic",
          cols: testXterm.current?.cols || 80,
          rows: testXterm.current?.rows || 15,
        }),
      });

      const data = await response.json();
      console.log("Got response from Create Session", data);

      if (data.status === "success" && data.session_id) {
        // Connect the new session to the test terminal
        connectWebSocket(
          data.session_id as TerminalSessionId,
          testXterm,
          testWs,
          setTestStatus,
          baseUrl,
        );
      } else {
        setError(data.error || "Failed to create terminal session");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  const disconnectAllTerminals = () => {
    devServerWs.current?.close();
    buildWs.current?.close();
    testWs.current?.close();

    devServerWs.current = null;
    buildWs.current = null;
    testWs.current = null;

    setDevServerStatus("disconnected");
    setBuildStatus("disconnected");
    setTestStatus("disconnected");

    devServerXterm.current?.clear();
    buildXterm.current?.clear();
    testXterm.current?.clear();
  };

  const allConnected =
    devServerStatus === "connected" &&
    buildStatus === "connected" &&
    testStatus === "connected";
  const anyConnected =
    devServerStatus === "connected" ||
    buildStatus === "connected" ||
    testStatus === "connected";

  return (
    <div className="flex-1 p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Build Worker Terminals
          </h1>
          <p className="text-muted-foreground">
            Interactive terminals connected to build worker (dev-server, build,
            test)
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            type="text"
            placeholder={`Base URL (default: ${API_BASE_URL})`}
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            className="w-80"
          />
          <Button
            onClick={initializeDefaultTerminals}
            disabled={loading || allConnected}
            variant="default"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Initialize Default Terminals
              </>
            )}
          </Button>
          <Button
            onClick={createNewSession}
            disabled={loading}
            variant="outline"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <TerminalIcon className="mr-2 h-4 w-4" />
                New Session
              </>
            )}
          </Button>
          {anyConnected && (
            <Button onClick={disconnectAllTerminals} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Disconnect All
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Dev Server Terminal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              Dev Server Terminal
              <span className="text-sm font-mono text-muted-foreground">
                (dev-server)
              </span>
              <span
                className={`ml-auto text-xs px-2 py-1 rounded-full ${
                  devServerStatus === "connected"
                    ? "bg-green-100 text-green-700"
                    : devServerStatus === "connecting"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {devServerStatus}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={devServerTerminal}
              className="w-full h-[250px] bg-[#1e1e1e] rounded-md overflow-hidden"
            />
          </CardContent>
        </Card>

        {/* Build Terminal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              Build Terminal
              <span className="text-sm font-mono text-muted-foreground">
                (build)
              </span>
              <span
                className={`ml-auto text-xs px-2 py-1 rounded-full ${
                  buildStatus === "connected"
                    ? "bg-green-100 text-green-700"
                    : buildStatus === "connecting"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {buildStatus}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={buildTerminal}
              className="w-full h-[250px] bg-[#1e1e1e] rounded-md overflow-hidden"
            />
          </CardContent>
        </Card>

        {/* Test Terminal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              Test Terminal
              <span className="text-sm font-mono text-muted-foreground">
                (test)
              </span>
              <span
                className={`ml-auto text-xs px-2 py-1 rounded-full ${
                  testStatus === "connected"
                    ? "bg-green-100 text-green-700"
                    : testStatus === "connecting"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {testStatus}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={testTerminal}
              className="w-full h-[250px] bg-[#1e1e1e] rounded-md overflow-hidden"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
