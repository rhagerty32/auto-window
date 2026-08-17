import { environment } from "@raycast/api";
import { appendFileSync } from "node:fs";
import path from "node:path";

/** JSON lines at <repo>/.debug.log (ray develop copies the repo as the extension root). */
export function debugLog(event: string, data?: unknown): void {
  const payload = { ts: new Date().toISOString(), event, data };
  console.log(`[auto-window] ${event}`, data === undefined ? "" : data);
  try {
    const file = path.join(environment.assetsPath, "..", ".debug.log");
    appendFileSync(file, `${JSON.stringify(payload)}\n`);
  } catch {
    // Extension copy may be read-only; console still shows in `npm run dev`.
  }
}

export function summarizeError(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}
