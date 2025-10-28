"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Loader2, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const API_BASE_URL = "http://localhost:3002";

export default function TerminalPage() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
      cols: 80,
      rows: 24,
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

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          if (sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
            fetch(`${API_BASE_URL}/terminal/${sessionId}/resize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cols: xtermRef.current.cols,
                rows: xtermRef.current.rows,
              }),
            }).catch(console.error);
          }
        } catch (err) {
          console.error("Failed to fit terminal on resize:", err);
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, [sessionId]);

  const createSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/terminal/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "generic",
          cols: xtermRef.current?.cols || 80,
          rows: xtermRef.current?.rows || 24,
        }),
      });

      const data = await response.json();
      console.log("Got response from Create Session", data);

      if (data.status === "success" && data.session_id) {
        setSessionId(data.session_id);
        // connectWebSocket(data.session_id);
      } else {
        setError(data.error || "Failed to create terminal session");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = (sid: string) => {
    setStatus("connecting");

    const ws = new WebSocket(`ws://localhost:3002/terminal/${sid}/ws`);
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
                event: "input",
                data: { input: data },
              })
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
            `\r\n\x1b[33mProcess exited with code: ${message.data?.exitCode ?? "unknown"}\x1b[0m`
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
      setError("WebSocket connection error");
      setStatus("disconnected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      xtermRef.current?.writeln("\r\n\x1b[31mConnection closed\x1b[0m");
    };
  };

  const closeSession = async () => {
    if (!sessionId) return;

    try {
      wsRef.current?.close();
      wsRef.current = null;

      await fetch(`${API_BASE_URL}/terminal/${sessionId}`, {
        method: "DELETE",
      });

      setSessionId(null);
      setStatus("disconnected");
      xtermRef.current?.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close session");
    }
  };

  return (
    <div className="flex-1 p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground">
            Interactive terminal connected to build worker
          </p>
        </div>
        <div className="flex gap-2">
          {!sessionId ? (
            <Button onClick={createSession} disabled={loading}>
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
          ) : (
            <Button onClick={closeSession} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Close Session
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" />
            Terminal Session
            {sessionId && (
              <span className="text-sm font-mono text-muted-foreground">
                ({sessionId.substring(0, 8)}...)
              </span>
            )}
            <span
              className={`ml-auto text-xs px-2 py-1 rounded-full ${status === "connected"
                ? "bg-green-100 text-green-700"
                : status === "connecting"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-700"
                }`}
            >
              {status}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div
            ref={terminalRef}
            className="w-full h-[600px] bg-[#1e1e1e] rounded-md overflow-hidden"
          />
          {!sessionId && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
              <div className="text-center text-white">
                <TerminalIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No active terminal session</p>
                <p className="text-sm text-gray-400 mt-2">
                  Click "New Session" to start
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
