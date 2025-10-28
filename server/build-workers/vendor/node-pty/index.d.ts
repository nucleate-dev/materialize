export interface IDisposable {
  dispose(): void;
}

export interface IPtyExitEvent {
  exitCode: number;
  signal?: string;
}

export interface IPty {
  pid: number;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): IDisposable;
  onExit(listener: (event: IPtyExitEvent) => void): IDisposable;
}

export interface IPtyForkOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  name?: string;
}

export interface TerminalSessionOptions extends IPtyForkOptions {
  encoding?: string;
}

export function spawn(
  file: string,
  args?: string[],
  options?: IPtyForkOptions,
): IPty;

declare const _default: {
  spawn: typeof spawn;
};

export default _default;
