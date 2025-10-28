import { spawn as spawnChild } from "node:child_process";
import { EventEmitter } from "node:events";

class Disposable {
  constructor(dispose) {
    this._dispose = dispose;
    this.disposed = false;
  }

  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      this._dispose();
    }
  }
}

class PseudoPty extends EventEmitter {
  constructor(command, args = [], options = {}) {
    super();
    this.command = command;
    this.args = args;
    this.options = options;
    this.closed = false;
    const spawnOptions = {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    };
    this.child = spawnChild(command, args, spawnOptions);
    this.pid = this.child.pid ?? -1;

    if (this.child.stdout) {
      this.child.stdout.setEncoding("utf8");
      this.child.stdout.on("data", (chunk) => {
        this.emit("data", chunk);
      });
    }

    if (this.child.stderr) {
      this.child.stderr.setEncoding("utf8");
      this.child.stderr.on("data", (chunk) => {
        this.emit("data", chunk);
      });
    }

    if (this.child.stdin) {
      this.child.stdin.setDefaultEncoding("utf8");
    }

    this.child.on("exit", (code, signal) => {
      this.closed = true;
      this.emit("exit", { exitCode: code ?? 0, signal: signal ?? undefined });
    });

    this.child.on("error", (error) => {
      this.emit("error", error);
    });
  }

  write(data) {
    if (this.child.stdin && !this.child.killed) {
      this.child.stdin.write(data);
    }
  }

  resize() {
    // No-op in pseudo implementation
  }

  kill(signal = "SIGTERM") {
    if (!this.closed) {
      this.child.kill(signal);
    }
  }

  onData(listener) {
    this.on("data", listener);
    return new Disposable(() => this.off("data", listener));
  }

  onExit(listener) {
    this.on("exit", listener);
    return new Disposable(() => this.off("exit", listener));
  }
}

export function spawn(command, args = [], options = {}) {
  return new PseudoPty(command, args, options);
}

export default {
  spawn,
};
