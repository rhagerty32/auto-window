import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  AccessibilityError,
  HelperMissingError,
  SpacesUnavailableError,
  listScreens,
  listSpaces,
  listWindows,
  moveWindow,
  raiseWindow,
  switchSpace,
  type HelperWindow,
} from "./helper";
import { regionToRect, resolveScreen, roundRect } from "./resolve";
import { clampSpaceIndex, groupSlotsBySpace, slotSpaceIndex, spaceCountForScreen } from "./spaces";
import { debugLog, summarizeError } from "./debug";
import type { Preset, Screen, WindowSlot } from "./types";
import { compareSlotZIndex, shouldRestackWindow } from "./zorder";
import { pickWindowForApply, windowKeys } from "./pick";

const execFileAsync = promisify(execFile);

export type SlotResult = {
  slot: WindowSlot;
  ok: boolean;
  warning?: string;
  error?: string;
  window?: HelperWindow;
};

export type ApplyResult = {
  presetName: string;
  results: SlotResult[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchApp(slot: WindowSlot): Promise<void> {
  try {
    if (slot.bundleId) {
      await execFileAsync("open", ["-b", slot.bundleId], { timeout: 8000 });
      return;
    }
  } catch {
    // Fall through to app name.
  }
  if (slot.appName) {
    await execFileAsync("open", ["-a", slot.appName], { timeout: 8000 });
  }
}

async function waitForWindow(
  slot: WindowSlot,
  timeoutMs: number,
  options?: { spaceIndex?: number; screenId?: string; exclude?: Set<string>; fullscreen?: boolean },
): Promise<HelperWindow | undefined> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { windows } = await listWindows(slot.bundleId || undefined, { quiet: true });
    const picked = pickWindowForApply(windows, slot.titleContains, options);
    if (picked) {
      return picked;
    }
    await sleep(250);
  }
  const { windows } = await listWindows(slot.bundleId || undefined, { quiet: true });
  return pickWindowForApply(windows, slot.titleContains, options);
}

async function applySlot(
  slot: WindowSlot,
  screens: Screen[],
  options: { screenId?: string; spaceIndex: number; used: Set<string> },
): Promise<SlotResult> {
  const label = slot.appName || slot.bundleId || "App";
  if (!slot.bundleId && !slot.appName) {
    return { slot, ok: false, error: "Slot is missing an application" };
  }

  const resolved = resolveScreen(screens, slot.display);
  if (!resolved) {
    return { slot, ok: false, error: `${label}: no displays found` };
  }

  const { running } = slot.bundleId ? await listWindows(slot.bundleId) : { running: false };

  if (!running && slot.launchIfNeeded) {
    try {
      await launchApp(slot);
    } catch (error) {
      return {
        slot,
        ok: false,
        error: `${label}: could not launch (${error instanceof Error ? error.message : "unknown error"})`,
      };
    }
  } else if (!running && !slot.launchIfNeeded) {
    return { slot, ok: false, error: `${label}: not running` };
  }

  const timeoutMs = running ? 2500 : 10_000;
  let window = await waitForWindow(slot, timeoutMs, {
    screenId: options.screenId,
    spaceIndex: slot.fullscreen ? undefined : options.spaceIndex,
    exclude: options.used,
    fullscreen: Boolean(slot.fullscreen),
  });
  if (!window && slot.bundleId) {
    try {
      await launchApp(slot);
    } catch {
      // Activation is best-effort; waitForWindow may still pick a window.
    }
    window = await waitForWindow(slot, 8_000, {
      screenId: options.screenId,
      spaceIndex: slot.fullscreen ? undefined : options.spaceIndex,
      exclude: options.used,
      fullscreen: Boolean(slot.fullscreen),
    });
  }
  if (!window) {
    const wanted = slot.titleContains.trim();
    return {
      slot,
      ok: false,
      error: wanted ? `${label}: no window titled “${wanted}”` : `${label}: no movable window`,
    };
  }

  const region = slot.fullscreen ? { kind: "named" as const, name: "fill" as const } : slot.region;
  const rect = roundRect(regionToRect(resolved.screen.visibleFrame, region));
  debugLog("apply.slot", {
    app: label,
    display: slot.display,
    screenId: resolved.screen.id,
    spaceIndex: options.spaceIndex,
    fullscreen: Boolean(slot.fullscreen),
    windowId: window.id,
    cgWindowId: window.cgWindowId,
    title: window.title,
    windowSpace: window.spaceIndex,
    windowScreen: window.screenId,
    rect,
    region: slot.region,
  });
  try {
    await moveWindow({
      id: window.id,
      cgWindowId: window.cgWindowId,
      rect,
      spaceIndex: slot.fullscreen ? undefined : options.spaceIndex,
      screenId: options.screenId ?? resolved.screen.id,
      fullscreen: slot.fullscreen,
      bundleId: slot.bundleId,
    });
    if (slot.fullscreen) {
      await sleep(400);
    }
    for (const key of windowKeys(window)) {
      options.used.add(key);
    }
  } catch (error) {
    return {
      slot,
      ok: false,
      error: `${label}: move failed (${error instanceof Error ? error.message : "unknown error"})`,
    };
  }

  const warnings: string[] = [];
  if (resolved.fallback) {
    warnings.push(`${label}: no builtin display, used ${resolved.fallback}`);
  }

  return { slot, ok: true, window, warning: warnings.length > 0 ? warnings.join("; ") : undefined };
}

async function restoreActiveSpaces(preset: Preset, screens: Screen[]): Promise<void> {
  if (!preset.displays?.length) {
    return;
  }
  for (const display of preset.displays) {
    if (display.activeFullscreen) {
      continue;
    }
    const resolved = resolveScreen(screens, display.role);
    if (!resolved) {
      continue;
    }
    try {
      await switchSpace(resolved.screen.id, display.activeSpaceIndex || 1);
    } catch (error) {
      if (error instanceof SpacesUnavailableError) {
        return;
      }
    }
  }
}

async function liveFullScreen(placed: HelperWindow, bundleId: string): Promise<boolean> {
  try {
    const { windows } = await listWindows(bundleId || undefined, { quiet: true });
    const keys = new Set(windowKeys(placed));
    const live = windows.find((window) => windowKeys(window).some((key) => keys.has(key)));
    return Boolean(live?.fullScreen);
  } catch {
    return Boolean(placed.fullScreen);
  }
}

function displayActiveFullscreen(preset: Preset, role: WindowSlot["display"]): boolean {
  return Boolean(preset.displays?.some((display) => display.role === role && display.activeFullscreen));
}

async function restackWindows(preset: Preset, results: SlotResult[]): Promise<void> {
  const placed = results.filter((result) => result.ok && result.window);
  const eligible: SlotResult[] = [];
  for (const result of placed) {
    const window = result.window;
    if (!window) {
      continue;
    }
    const live = result.slot.fullscreen ? await liveFullScreen(window, result.slot.bundleId) : false;
    if (
      !shouldRestackWindow({
        fullscreenSlot: Boolean(result.slot.fullscreen),
        liveFullScreen: live,
        displayActiveFullscreen: displayActiveFullscreen(preset, result.slot.display),
      })
    ) {
      continue;
    }
    eligible.push(result);
  }
  eligible.sort((a, b) => compareSlotZIndex(a.slot, b.slot));
  debugLog(
    "apply.z-order",
    eligible.map((result) => ({
      app: result.slot.appName,
      zIndex: result.slot.zIndex,
      fullscreen: Boolean(result.slot.fullscreen),
      windowId: result.window?.id,
    })),
  );
  for (const result of eligible) {
    const window = result.window;
    if (!window) {
      continue;
    }
    try {
      await raiseWindow({ id: window.id, cgWindowId: window.cgWindowId });
      await sleep(40);
    } catch (error) {
      debugLog("apply.raise-fail", { app: result.slot.appName, error: summarizeError(error) });
    }
  }
}

export async function applyPreset(preset: Preset): Promise<ApplyResult> {
  debugLog("apply.start", {
    name: preset.name,
    displayCount: preset.displayCount,
    slots: preset.slots.map((slot) => ({
      app: slot.appName,
      display: slot.display,
      spaceIndex: slotSpaceIndex(slot),
      region: slot.region,
      titleContains: slot.titleContains,
      zIndex: slot.zIndex,
      fullscreen: Boolean(slot.fullscreen),
    })),
  });
  const screens = await listScreens();
  const spaces = await listSpaces();
  debugLog("apply.desk", {
    screenCount: screens.length,
    screens: screens.map((s) => ({
      id: s.id,
      isBuiltin: s.isBuiltin,
      isMain: s.isMain,
      visible: s.visibleFrame,
    })),
    spaces,
  });
  const results: SlotResult[] = [];
  const groups = groupSlotsBySpace(preset.slots);
  const used = new Set<string>();
  debugLog(
    "apply.groups",
    groups.map((g) => ({ display: g.display, spaceIndex: g.spaceIndex, apps: g.slots.map((s) => s.appName) })),
  );

  for (const group of groups) {
    const resolved = resolveScreen(screens, group.display);
    const screenId = resolved?.screen.id;
    let spaceWarning: string | undefined;
    const names = group.slots.map((s) => s.appName || s.bundleId || "App").join(", ");

    if (spaces.available && screenId) {
      const count = spaceCountForScreen(spaces, screenId);
      const { index, clamped } = clampSpaceIndex(group.spaceIndex, count || 1);
      if (clamped) {
        spaceWarning = `${names}: no Space ${group.spaceIndex}`;
      }
      try {
        await switchSpace(screenId, index);
        await sleep(200);
      } catch (error) {
        if (!(error instanceof SpacesUnavailableError)) {
          spaceWarning = [spaceWarning, `${names}: could not switch to Space ${index}`].filter(Boolean).join("; ");
        }
      }
    }

    const ordered = [
      ...group.slots.filter((slot) => !slot.fullscreen),
      ...group.slots.filter((slot) => slot.fullscreen),
    ];
    for (const slot of ordered) {
      try {
        const result = await applySlot(slot, screens, {
          screenId,
          spaceIndex: slotSpaceIndex(slot),
          used,
        });
        if (spaceWarning) {
          if (result.ok) {
            result.warning = [result.warning, spaceWarning].filter(Boolean).join("; ");
          } else {
            result.error = [result.error, spaceWarning].filter(Boolean).join("; ");
          }
          spaceWarning = undefined;
        }
        results.push(result);
      } catch (error) {
        if (error instanceof AccessibilityError || error instanceof HelperMissingError) {
          throw error;
        }
        results.push({
          slot,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        debugLog("apply.slot-throw", { app: slot.appName, error: summarizeError(error) });
      }
    }
  }

  if (preset.slots.some((slot) => slot.fullscreen)) {
    await sleep(500);
  }
  await restoreActiveSpaces(preset, screens);
  await sleep(150);
  await restackWindows(preset, results);
  debugLog("apply.done", {
    presetName: preset.name,
    results: results.map((r) => ({ app: r.slot.appName, ok: r.ok, warning: r.warning, error: r.error })),
  });
  return { presetName: preset.name, results };
}

export function applySummary(result: ApplyResult): { title: string; message?: string; failed: boolean } {
  if (result.results.length === 0) {
    return { title: `${result.presetName} has no windows`, failed: true };
  }
  const failures = result.results.filter((r) => !r.ok);
  const warnings = result.results.filter((r) => r.ok && r.warning);
  if (failures.length === result.results.length) {
    return {
      title: `Could not apply ${result.presetName}`,
      message:
        failures
          .map((f) => f.error)
          .filter(Boolean)
          .join(" · ") || undefined,
      failed: true,
    };
  }
  if (failures.length > 0) {
    return {
      title: `Applied ${result.presetName} with ${failures.length} issue(s)`,
      message: [...failures.map((f) => f.error), ...warnings.map((w) => w.warning)].filter(Boolean).join(" · "),
      failed: false,
    };
  }
  if (warnings.length > 0) {
    return {
      title: `Applied ${result.presetName}`,
      message: warnings
        .map((w) => w.warning)
        .filter(Boolean)
        .join(" · "),
      failed: false,
    };
  }
  return { title: `Applied ${result.presetName}`, failed: false };
}
