import { environment } from "@raycast/api";
import { execFile } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { debugLog, summarizeError } from "./debug";
import type { Rect, Screen } from "./types";

const execFileAsync = promisify(execFile);

export class AccessibilityError extends Error {
  readonly code = 2;
  constructor() {
    super("Enable layout-helper in System Settings → Privacy & Security → Accessibility, then run the command again.");
    this.name = "AccessibilityError";
  }
}

export class SpacesUnavailableError extends Error {
  readonly code = 3;
  constructor() {
    super("Mission Control Spaces are unavailable.");
    this.name = "SpacesUnavailableError";
  }
}

export class HelperMissingError extends Error {
  constructor(public readonly helperPath: string) {
    super(`layout-helper is missing at ${helperPath}. Run npm run build-helper in the auto-window repo.`);
    this.name = "HelperMissingError";
  }
}

export type HelperWindow = {
  id: string;
  pid: number;
  index: number;
  cgWindowId?: number | null;
  bundleId: string | null;
  appName: string | null;
  title: string;
  frame: Rect;
  positionable: boolean;
  role: string;
  subrole: string;
  screenId?: string | null;
  spaceIndex?: number | null;
  fullScreen?: boolean;
  minimized?: boolean;
  stackIndex?: number;
};

export type WindowsResponse = {
  running: boolean;
  windows: HelperWindow[];
};

export type SpaceInfo = {
  index: number;
  id: string;
  type: number;
};

export type SpaceDisplay = {
  uuid: string;
  screenId: string | null;
  activeIndex: number;
  activeFullscreen?: boolean;
  spaces: SpaceInfo[];
};

export type SpacesResponse = {
  available: boolean;
  separateSpaces: boolean;
  displays: SpaceDisplay[];
};

export type MoveWindowOptions = {
  id: string;
  cgWindowId?: number | null;
  rect: Rect;
  spaceIndex?: number;
  screenId?: string;
  fullscreen?: boolean;
  bundleId?: string;
};

export function helperPath(): string {
  return path.join(environment.assetsPath, "layout-helper");
}

export function ensureHelper(): string {
  const bin = helperPath();
  if (!existsSync(bin)) {
    throw new HelperMissingError(bin);
  }
  try {
    chmodSync(bin, 0o755);
  } catch {
    // Raycast's assets copy may be read-only; exec still works if the bit is set.
  }
  return bin;
}

async function runHelper(argv: string[], options?: { quiet?: boolean }): Promise<string> {
  const bin = ensureHelper();
  if (!options?.quiet) {
    debugLog("helper.run", { argv, bin });
  }
  try {
    const { stdout, stderr } = await execFileAsync(bin, argv, { timeout: 20_000, encoding: "utf8" });
    if (!options?.quiet) {
      const trimmed = stdout.length > 4000 ? `${stdout.slice(0, 4000)}…` : stdout.trim();
      debugLog("helper.ok", { argv: argv[0], stdout: trimmed, stderr: stderr?.trim() || undefined });
    }
    return stdout;
  } catch (error) {
    const err = error as { status?: number; code?: number | string; stderr?: string; message?: string };
    const status = typeof err.status === "number" ? err.status : typeof err.code === "number" ? err.code : undefined;
    const stderr = String(err.stderr ?? err.message ?? "");
    debugLog("helper.fail", { argv, status, stderr, error: summarizeError(error) });
    if (status === 2 || stderr.includes("accessibility_untrusted")) {
      throw new AccessibilityError();
    }
    if (status === 3 || stderr.includes("spaces_unavailable")) {
      throw new SpacesUnavailableError();
    }
    throw new Error(stderr.trim() || `layout-helper ${argv[0]} failed`);
  }
}

export async function listScreens(): Promise<Screen[]> {
  const stdout = await runHelper(["screens"]);
  const parsed = JSON.parse(stdout) as { screens: Screen[] };
  return parsed.screens;
}

export async function listSpaces(): Promise<SpacesResponse> {
  try {
    const stdout = await runHelper(["spaces"]);
    return JSON.parse(stdout) as SpacesResponse;
  } catch (error) {
    if (error instanceof AccessibilityError || error instanceof HelperMissingError) {
      throw error;
    }
    return { available: false, separateSpaces: true, displays: [] };
  }
}

export async function listWindows(bundleId?: string, options?: { quiet?: boolean }): Promise<WindowsResponse> {
  const argv = bundleId ? ["windows", "--bundle-id", bundleId] : ["windows"];
  const stdout = await runHelper(argv, options);
  return JSON.parse(stdout) as WindowsResponse;
}

export async function switchSpace(screenId: string, index: number): Promise<void> {
  await runHelper(["space-switch", "--screen-id", screenId, "--index", String(index)]);
}

export async function moveWindow(options: MoveWindowOptions): Promise<void> {
  const args = [
    "move",
    "--x",
    String(options.rect.x),
    "--y",
    String(options.rect.y),
    "--width",
    String(options.rect.width),
    "--height",
    String(options.rect.height),
  ];

  const cgFromId = options.id.startsWith("cg:") ? Number(options.id.slice(3)) : undefined;
  const cgWindowId = options.cgWindowId ?? (Number.isFinite(cgFromId) ? cgFromId : undefined);
  if (cgWindowId) {
    args.push("--cg-id", String(cgWindowId));
  } else {
    args.push("--id", options.id);
  }

  if (options.spaceIndex != null && !options.fullscreen) {
    args.push("--space", String(options.spaceIndex));
  }
  if (options.screenId) {
    args.push("--screen-id", options.screenId);
  }
  if (options.fullscreen) {
    args.push("--fullscreen", "true");
  }
  if (options.bundleId) {
    args.push("--bundle-id", options.bundleId);
  }

  try {
    await runHelper(args);
  } catch (error) {
    if (error instanceof SpacesUnavailableError && options.spaceIndex != null) {
      await moveWindow({ ...options, spaceIndex: undefined });
      return;
    }
    throw error;
  }
}

export async function raiseWindow(options: { id: string; cgWindowId?: number | null }): Promise<void> {
  const args = ["raise"];
  const cgFromId = options.id.startsWith("cg:") ? Number(options.id.slice(3)) : undefined;
  const cgWindowId = options.cgWindowId ?? (Number.isFinite(cgFromId) ? cgFromId : undefined);
  if (cgWindowId) {
    args.push("--cg-id", String(cgWindowId));
  } else {
    args.push("--id", options.id);
  }
  await runHelper(args, { quiet: true });
}

export async function checkTrusted(): Promise<boolean> {
  try {
    const stdout = await runHelper(["check"]);
    const parsed = JSON.parse(stdout) as { trusted: boolean };
    return parsed.trusted;
  } catch (error) {
    if (error instanceof AccessibilityError) {
      return false;
    }
    throw error;
  }
}
