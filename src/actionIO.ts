// Minimal GitHub Actions I/O — avoids depending on @actions/core (its v3+ is ESM-only
// and breaks the ncc CJS bundle; v1.x drags in a transitively vulnerable undici via
// @actions/http-client that we never actually use).

export function getInput(name: string, options?: { required?: boolean }): string {
  const envName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = (process.env[envName] ?? "").trim();

  if (options?.required && value === "") {
    throw new Error(`Input required and not supplied: ${name}`);
  }

  return value;
}

export function getBooleanInput(name: string, defaultValue: boolean): boolean {
  const value = getInput(name).toLowerCase();
  if (value === "") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error(`Input '${name}' must be 'true' or 'false', got '${value}'`);
}

export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function setFailed(message: string): void {
  process.exitCode = 1;
  process.stdout.write(`::error::${message}\n`);
}
