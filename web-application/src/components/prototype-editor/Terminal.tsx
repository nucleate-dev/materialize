"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

export type TerminalSession = "build" | "dev-server" | "test";

export interface TerminalProps {
  className?: string;
  baseTunnelUrl?: string | null;
  onResize?: (cols: number, rows: number) => void;
  activeSession?: TerminalSession;
  onSessionChange?: (session: TerminalSession) => void;
}

const TERMINAL_SESSIONS: TerminalSession[] = ["dev-server", "build", "test"];

const TERMINAL_SESSION_PATHS: Record<TerminalSession, string> = {
  build: "/terminal/ws/build",
  "dev-server": "/terminal/ws/dev-server",
  test: "/terminal/ws/test",
};

const TERMINAL_SESSION_LABELS: Record<TerminalSession, string> = {
  build: "Build",
  "dev-server": "Dev Server",
  test: "AI",
};

interface TerminalInstanceState {
  xterm: XTerm;
  fitAddon: FitAddon;
  ws: WebSocket | null;
  isConnected: boolean;
}

export default function Terminal({
  className = "",
  baseTunnelUrl,
  onResize,
  activeSession,
  onSessionChange,
}: TerminalProps) {
  const [internalActiveSession, setInternalActiveSession] =
    useState<TerminalSession>("dev-server");
  const resolvedActiveSession = activeSession ?? internalActiveSession;
  const terminalRefsMap = useRef<Map<TerminalSession, HTMLDivElement>>(
    new Map(),
  );
  const terminalInstancesMap = useRef<
    Map<TerminalSession, TerminalInstanceState>
  >(new Map());

  // Initialize terminal instances for each session
  useEffect(() => {
    const instancesToCleanup: Array<{
      session: TerminalSession;
      instance: TerminalInstanceState;
    }> = [];
    const instancesMap = terminalInstancesMap.current;

    TERMINAL_SESSIONS.forEach((session) => {
      const container = terminalRefsMap.current.get(session);
      if (!container || instancesMap.has(session)) return;

      // Initialize xterm
      const terminal = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#0a0a0a",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          black: "#000000",
          red: "#cd3131",
          green: "#0dbc79",
          yellow: "#e5e510",
          blue: "#2472c8",
          magenta: "#bc3fbc",
          cyan: "#11a8cd",
          white: "#e5e5e5",
          brightBlack: "#666666",
          brightRed: "#f14c4c",
          brightGreen: "#23d18b",
          brightYellow: "#f5f543",
          brightBlue: "#3b8eea",
          brightMagenta: "#d670d6",
          brightCyan: "#29b8db",
          brightWhite: "#e5e5e5",
        },
        scrollback: 1000,
        allowProposedApi: true,
      });

      // Initialize fit addon
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Open terminal in container
      terminal.open(container);

      // Store instance
      const instance: TerminalInstanceState = {
        xterm: terminal,
        fitAddon,
        ws: null,
        isConnected: false,
      };
      instancesMap.set(session, instance);
      instancesToCleanup.push({ session, instance });

      // Fit terminal to container
      setTimeout(() => {
        try {
          fitAddon.fit();
          if (onResize) {
            onResize(terminal.cols, terminal.rows);
          }
        } catch {
          // Do nothing
        }
      }, 0);

      // Welcome message
      terminal.writeln(
        "\x1b[1;32m┌─────────────────────────────────────────┐\x1b[0m",
      );
      terminal.writeln(
        `\x1b[1;32m│  \x1b[1;37mNucleate Terminal - ${
          TERMINAL_SESSION_LABELS[session]
        }\x1b[1;32m${" ".repeat(
          Math.max(0, 13 - TERMINAL_SESSION_LABELS[session].length),
        )}│\x1b[0m`,
      );
      terminal.writeln(
        "\x1b[1;32m└─────────────────────────────────────────┘\x1b[0m",
      );
      terminal.writeln("");
      terminal.writeln("");
    });

    // Cleanup function
    return () => {
      instancesToCleanup.forEach(({ session, instance }) => {
        if (instance.ws) {
          instance.ws.close();
        }
        instance.xterm.dispose();
        instancesMap.delete(session);
      });
    };
  }, [onResize, baseTunnelUrl]);

  useEffect(() => {
    const instance = terminalInstancesMap.current.get(resolvedActiveSession);

    // requestAnimationFrame ensures the DOM has updated from 'hidden' to 'block'
    // before we attempt to calculate the fit dimensions.
    const frameId = requestAnimationFrame(() => {
      if (instance) {
        try {
          instance.fitAddon.fit();
          // Optional: Notify parent of new size if needed
          if (onResize) {
            onResize(instance.xterm.cols, instance.xterm.rows);
          }
        } catch {
          // fit() might fail if the element is still not visible for some reason
        }
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [resolvedActiveSession, onResize]);

  // Handle resize for all terminals
  useEffect(() => {
    const resizeObservers: ResizeObserver[] = [];

    terminalRefsMap.current.forEach((container, session) => {
      const instance = terminalInstancesMap.current.get(session);
      if (!instance) return;

      const handleResize = () => {
        try {
          instance.fitAddon.fit();
          if (onResize) {
            onResize(instance.xterm.cols, instance.xterm.rows);
          }
        } catch {
          // Do nothing
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      resizeObservers.push(resizeObserver);
    });

    return () => {
      resizeObservers.forEach((observer) => observer.disconnect());
    };
  }, [onResize]);

  // WebSocket connection management for each session
  useEffect(() => {
    if (!baseTunnelUrl) {
      return;
    }

    const cleanupFunctions: (() => void)[] = [];

    TERMINAL_SESSIONS.forEach((session) => {
      const instance = terminalInstancesMap.current.get(session);
      if (!instance) return;

      // Skip if already connected
      if (
        instance.ws &&
        (instance.ws.readyState === WebSocket.OPEN ||
          instance.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      const finalTunnelUrlBase = baseTunnelUrl;
      // Construct the full WebSocket URL for this session
      const sessionPath = TERMINAL_SESSION_PATHS[session];
      const fullTerminalUrl = finalTunnelUrlBase.endsWith("/")
        ? `${finalTunnelUrlBase}${sessionPath.slice(1)}`
        : `${finalTunnelUrlBase}${sessionPath}`;
      // Create WebSocket connection
      const ws = new WebSocket(fullTerminalUrl);
      instance.ws = ws;

      ws.onopen = () => {
        instance.isConnected = true;
        instance.xterm.writeln("\x1b[1;32m✓ Connected to dev server\x1b[0m");
        instance.xterm.writeln("");

        // Handle terminal input (send to WebSocket) - set up AFTER connection is open
        instance.xterm.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            const message = {
              type: "input",
              data: data,
            };
            ws.send(JSON.stringify(message));
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.event === "output" && message.data?.chunk) {
            instance.xterm.write(message.data.chunk);
          } else if (message.event === "exit") {
            instance.xterm.writeln(
              `\r\n\x1b[33mProcess exited with code: ${
                message.data?.exitCode ?? "unknown"
              }\x1b[0m`,
            );
          } else if (message.event === "error") {
            instance.xterm.writeln(
              `\r\n\x1b[31mError: ${
                message.data?.error || "Terminal error occurred"
              }\x1b[0m`,
            );
          }
        } catch {
          // Fallback: treat as raw data
          instance.xterm.write(event.data);
        }
      };

      ws.onerror = () => {
        instance.xterm.writeln("\x1b[1;31m✗ WebSocket error occurred\x1b[0m");
      };

      ws.onclose = () => {
        instance.isConnected = false;
        instance.xterm.writeln("\r\n\x1b[31mConnection closed\x1b[0m");
      };

      // Store cleanup function
      cleanupFunctions.push(() => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
        instance.ws = null;
      });
    });

    // Cleanup all connections
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [baseTunnelUrl]);

  const handleSessionChange = (session: TerminalSession) => {
    if (activeSession === undefined) {
      setInternalActiveSession(session);
    }
    onSessionChange?.(session);
  };

  useEffect(() => {
    if (activeSession !== undefined) {
      setInternalActiveSession(activeSession);
    }
  }, [activeSession]);

  return (
    <div className={`w-full h-full flex flex-col ${className}`}>
      {/* Tab Navigation */}
      <div className="flex border-b border-border bg-card">
        {TERMINAL_SESSIONS.map((session) => {
          const instance = terminalInstancesMap.current.get(session);
          const isConnected = instance?.isConnected || false;

          return (
            <button
              key={session}
              onClick={() => handleSessionChange(session)}
              className={`
                px-4 py-2 text-sm font-medium transition-colors relative
                ${
                  resolvedActiveSession === session
                    ? "text-foreground bg-background border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }
              `}
            >
              <div className="flex items-center gap-2">
                {TERMINAL_SESSION_LABELS[session]}
                {/* Connection indicator */}
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-success" : "bg-muted-foreground"
                  }`}
                  title={isConnected ? "Connected" : "Disconnected"}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Terminal Containers */}
      <div className="flex-1 relative">
        {TERMINAL_SESSIONS.map((session) => (
          <div
            key={session}
            ref={(el) => {
              if (el) terminalRefsMap.current.set(session, el);
            }}
            className={`w-full h-full bg-background overflow-hidden absolute inset-0 ${
              resolvedActiveSession === session ? "block" : "hidden"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Export methods to interact with terminal
export const useTerminal = () => {
  const terminalInstanceRef = useRef<XTerm | null>(null);

  const writeLine = (text: string) => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.writeln(text);
    }
  };

  const write = (text: string) => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.write(text);
    }
  };

  const clear = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
    }
  };

  return {
    terminalInstanceRef,
    writeLine,
    write,
    clear,
  };
};
