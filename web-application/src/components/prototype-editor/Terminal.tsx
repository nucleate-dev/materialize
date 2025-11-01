"use client";

import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  className?: string;
  onResize?: (cols: number, rows: number) => void;
}

export default function Terminal({ className = "", onResize }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

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
    terminal.open(terminalRef.current);

    // Fit terminal to container
    fitAddon.fit();

    // Notify parent of terminal size
    if (onResize) {
      onResize(terminal.cols, terminal.rows);
    }

    // Store references
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Welcome message
    terminal.writeln("\x1b[1;32m┌─────────────────────────────────────────┐\x1b[0m");
    terminal.writeln("\x1b[1;32m│  \x1b[1;37mMaterialize Terminal\x1b[1;32m                 │\x1b[0m");
    terminal.writeln("\x1b[1;32m└─────────────────────────────────────────┘\x1b[0m");
    terminal.writeln("");
    terminal.writeln("\x1b[2mConnecting to dev server...\x1b[0m");
    terminal.writeln("");

    // Handle resize events
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        if (onResize) {
          onResize(xtermRef.current.cols, xtermRef.current.rows);
        }
      }
    };

    // Use ResizeObserver for better resize detection
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onResize]);

  return (
    <div
      ref={terminalRef}
      className={`w-full h-full bg-[#0a0a0a] rounded-md overflow-hidden ${className}`}
    />
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
