export interface Output {
  write(msg: string): void;
  error(msg: string): void;
  setExitCode(code: number): void;
}

export function createProcessOutput(): Output {
  return {
    write(msg: string) {
      process.stdout.write(msg);
    },
    error(msg: string) {
      process.stderr.write(msg);
    },
    setExitCode(code: number) {
      process.exitCode = code;
    },
  };
}
