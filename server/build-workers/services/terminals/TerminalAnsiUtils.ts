const ANSI_REGEX =
  /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-ntqry=><~])/g;

export function stripAnsiSequences(input: string): string {
  if (!input) {
    return "";
  }
  return input.replace(ANSI_REGEX, "");
}
