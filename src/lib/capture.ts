import { randomUUID } from "node:crypto";
import { namedRegionFractions, regionToRect, resolveScreen } from "./resolve";
import type { HelperWindow, SpacesResponse } from "./helper";
import {
  NAMED_REGIONS,
  ROLE_INFER_ORDER,
  shortRoleTitle,
  type DisplayRole,
  type NamedRegion,
  type Preset,
  type PresetDisplay,
  type Rect,
  type Region,
  type Screen,
  type WindowSlot,
} from "./types";

export type CaptureCandidate = {
  id: string;
  bundleId: string;
  appName: string;
  title: string;
  titleContains: string;
  display: DisplayRole;
  region: Region;
  spaceIndex: number;
  fullscreen: boolean;
  zIndex: number;
  screenId?: string;
  cgWindowId?: number;
};

export type CaptureGroup = {
  label: string;
  items: CaptureCandidate[];
};

const REGION_TOLERANCE = 0.08;
const FILL_COVERAGE = 0.96;

function almost(a: number, b: number, tol = REGION_TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
}

export function looksNativeFullscreen(frame: Rect, screen: Screen): boolean {
  const full = screen.frame;
  const widthOk = Math.abs(frame.width - full.width) < 8 && Math.abs(frame.x - full.x) < 4;
  const topOk = Math.abs(frame.y - full.y) < 4 || (frame.y >= full.y && frame.y <= full.y + 40);
  const bottom = frame.y + frame.height;
  const heightOk = Math.abs(frame.height - full.height) < 8 || Math.abs(bottom - (full.y + full.height)) < 12;
  return widthOk && topOk && heightOk;
}

export function inferRole(screens: Screen[], screenId: string): DisplayRole {
  for (const role of ROLE_INFER_ORDER) {
    const resolved = resolveScreen(screens, role);
    if (resolved && !resolved.fallback && resolved.screen.id === screenId) {
      return role;
    }
  }
  return "main";
}

export function inferWindowRegion(visible: Rect, frame: Rect): Region {
  const vw = Math.max(visible.width, 1);
  const vh = Math.max(visible.height, 1);
  const frac = {
    x: (frame.x - visible.x) / vw,
    y: (frame.y - visible.y) / vh,
    w: frame.width / vw,
    h: frame.height / vh,
  };
  const coverage = frac.w * frac.h;
  if (coverage >= FILL_COVERAGE && almost(frac.x, 0) && almost(frac.y, 0)) {
    return { kind: "named", name: "fill" };
  }

  for (const { value } of NAMED_REGIONS) {
    const named = namedRegionFractions(value);
    if (almost(frac.x, named.x) && almost(frac.y, named.y) && almost(frac.w, named.w) && almost(frac.h, named.h)) {
      return { kind: "named", name: value };
    }
  }

  return {
    kind: "percent",
    x: round3(clamp01(frac.x)),
    y: round3(clamp01(frac.y)),
    w: round3(Math.min(1, Math.max(0.01, frac.w))),
    h: round3(Math.min(1, Math.max(0.01, frac.h))),
  };
}

export function inferTitleContains(windows: { id: string; bundleId: string; title: string }[]): Record<string, string> {
  const counts = new Map<string, number>();
  for (const window of windows) {
    counts.set(window.bundleId, (counts.get(window.bundleId) ?? 0) + 1);
  }
  const out: Record<string, string> = {};
  for (const window of windows) {
    if ((counts.get(window.bundleId) ?? 0) < 2 || isVolatileTitleBundle(window.bundleId)) {
      out[window.id] = "";
      continue;
    }
    const title = window.title
      .trim()
      .replace(/[.…]+$/u, "")
      .trim();
    out[window.id] = title.length <= 48 ? title : title.slice(0, 48);
  }
  return out;
}

export function screenForWindow(window: HelperWindow, screens: Screen[]): Screen | undefined {
  if (window.screenId) {
    const hit = screens.find((screen) => screen.id === window.screenId);
    if (hit) {
      return hit;
    }
  }
  const cx = window.frame.x + window.frame.width / 2;
  const cy = window.frame.y + window.frame.height / 2;
  return (
    screens.find((screen) => pointInRect(cx, cy, screen.visibleFrame)) ??
    screens.find((screen) => pointInRect(cx, cy, screen.frame))
  );
}

const SKIP_SUBROLES = new Set(["AXSystemDialog", "AXDialog", "AXSheet"]);

/** WindowServer placeholder size used by Ghostty/Messages/Chromium ghosts. */
export function isPlaceholderFrame(frame: Rect): boolean {
  return Math.abs(frame.width - 500) <= 24 && Math.abs(frame.height - 500) <= 24;
}

const VOLATILE_TITLE_BUNDLES = new Set([
  "company.thebrowser.dia",
  "company.thebrowser.Browser",
  "com.apple.Safari",
  "com.google.Chrome",
  "com.brave.Browser",
  "org.mozilla.firefox",
  "com.microsoft.edgemac",
]);

/** Tab titles change constantly; never store or match them for these apps. */
export function isVolatileTitleBundle(bundleId: string | null | undefined): boolean {
  return Boolean(bundleId && VOLATILE_TITLE_BUNDLES.has(bundleId));
}

export function storedTitleContains(bundleId: string | null | undefined, titleContains: string): string {
  return isVolatileTitleBundle(bundleId) ? "" : titleContains.trim();
}

export function isCapturableWindow(window: HelperWindow, all: HelperWindow[]): boolean {
  if (!window.positionable || !window.bundleId) {
    return false;
  }
  if (SKIP_SUBROLES.has(window.subrole)) {
    return false;
  }
  if (isPlaceholderFrame(window.frame)) {
    const hasLargerSibling = all.some(
      (other) =>
        other.id !== window.id &&
        other.bundleId === window.bundleId &&
        other.positionable &&
        !SKIP_SUBROLES.has(other.subrole) &&
        other.frame.width * other.frame.height > window.frame.width * window.frame.height + 20_000,
    );
    if (hasLargerSibling || !window.title.trim() || window.subrole === "CGWindow") {
      return false;
    }
  }
  if (window.subrole === "CGWindow" && !window.title.trim()) {
    const hasRealSibling = all.some(
      (other) =>
        other.id !== window.id &&
        other.bundleId === window.bundleId &&
        other.positionable &&
        other.subrole !== "CGWindow" &&
        !SKIP_SUBROLES.has(other.subrole),
    );
    if (hasRealSibling) {
      return false;
    }
  }
  return true;
}

function dedupeWindows(windows: HelperWindow[]): HelperWindow[] {
  const seen = new Set<string>();
  const out: HelperWindow[] = [];
  for (const window of windows) {
    const key = window.cgWindowId
      ? `cg:${window.cgWindowId}`
      : `${window.bundleId}:${window.title}:${window.spaceIndex ?? 1}:${Math.round(window.frame.x)}:${Math.round(window.frame.y)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(window);
  }
  return out;
}

export function buildCandidates(windows: HelperWindow[], screens: Screen[]): CaptureCandidate[] {
  const usable = dedupeWindows(windows.filter((window) => isCapturableWindow(window, windows)));
  const titles = inferTitleContains(
    usable.map((window) => ({
      id: window.id,
      bundleId: window.bundleId as string,
      title: window.title,
    })),
  );

  const candidates: CaptureCandidate[] = [];
  for (const window of usable) {
    const screen = screenForWindow(window, screens);
    if (!screen) {
      continue;
    }
    candidates.push({
      id: window.id,
      bundleId: window.bundleId as string,
      appName: window.appName || window.bundleId || "App",
      title: window.title,
      titleContains: titles[window.id] ?? "",
      display: inferRole(screens, screen.id),
      region: inferWindowRegion(screen.visibleFrame, window.frame),
      spaceIndex: window.spaceIndex && window.spaceIndex > 0 ? window.spaceIndex : 1,
      fullscreen: Boolean(window.fullScreen) || looksNativeFullscreen(window.frame, screen),
      zIndex: window.stackIndex ?? 0,
      screenId: screen.id,
      cgWindowId: window.cgWindowId ?? undefined,
    });
  }

  const roleOrder = new Map(ROLE_INFER_ORDER.map((role, index) => [role, index]));
  candidates.sort((a, b) => {
    const roleDelta = (roleOrder.get(a.display) ?? 99) - (roleOrder.get(b.display) ?? 99);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    if (a.spaceIndex !== b.spaceIndex) {
      return a.spaceIndex - b.spaceIndex;
    }
    if (a.zIndex !== b.zIndex) {
      return b.zIndex - a.zIndex;
    }
    return a.appName.localeCompare(b.appName);
  });
  return candidates;
}

export function captureGroups(candidates: CaptureCandidate[], separateSpaces: boolean): CaptureGroup[] {
  const maxSpace = Math.max(1, ...candidates.map((c) => c.spaceIndex));
  if (!separateSpaces && maxSpace > 1) {
    const groups: CaptureGroup[] = [];
    for (let space = 1; space <= maxSpace; space++) {
      const items = candidates.filter((c) => c.spaceIndex === space);
      if (items.length > 0) {
        groups.push({ label: `Space ${space}`, items });
      }
    }
    return groups;
  }

  const maxByRole = new Map<DisplayRole, number>();
  for (const candidate of candidates) {
    maxByRole.set(candidate.display, Math.max(maxByRole.get(candidate.display) ?? 1, candidate.spaceIndex));
  }

  const groups: CaptureGroup[] = [];
  for (const role of ROLE_INFER_ORDER) {
    const roleMax = maxByRole.get(role) ?? 1;
    for (let space = 1; space <= roleMax; space++) {
      const items = candidates.filter((c) => c.display === role && c.spaceIndex === space);
      if (items.length === 0) {
        continue;
      }
      const label = roleMax > 1 ? `${shortRoleTitle(role)} · Space ${space}` : shortRoleTitle(role);
      groups.push({ label, items });
    }
  }
  return groups;
}

export function captureDisplays(screens: Screen[], spaces: SpacesResponse): PresetDisplay[] {
  const seen = new Set<DisplayRole>();
  const displays: PresetDisplay[] = [];
  for (const display of spaces.displays) {
    if (!display.screenId) {
      continue;
    }
    const role = inferRole(screens, display.screenId);
    if (seen.has(role)) {
      continue;
    }
    seen.add(role);
    displays.push({
      role,
      activeSpaceIndex: display.activeIndex || 1,
      ...(display.activeFullscreen ? { activeFullscreen: true } : {}),
    });
  }
  return displays;
}

export function suggestedCaptureName(displayCount: number): string {
  if (displayCount === 4) {
    return "Work";
  }
  if (displayCount === 1) {
    return "Laptop";
  }
  return `Desk (${displayCount} displays)`;
}

export function candidateToSlot(candidate: CaptureCandidate): WindowSlot {
  return {
    id: randomUUID(),
    bundleId: candidate.bundleId,
    appName: candidate.appName,
    titleContains: storedTitleContains(candidate.bundleId, candidate.titleContains),
    display: candidate.display,
    region: candidate.region,
    launchIfNeeded: true,
    spaceIndex: candidate.spaceIndex,
    fullscreen: candidate.fullscreen,
    zIndex: candidate.zIndex,
  };
}

export function regionLabel(region: Region, fullscreen = false): string {
  if (fullscreen) {
    return "Fullscreen";
  }
  if (region.kind === "named") {
    return NAMED_REGIONS.find((item) => item.value === region.name)?.title ?? region.name;
  }
  return `${Math.round(region.w * 100)}% × ${Math.round(region.h * 100)}%`;
}

export function findPresetToUpdate(presets: Preset[], name: string, displayCount: number): Preset | undefined {
  const needle = name.trim().toLowerCase();
  return (
    presets.find((preset) => preset.name.trim().toLowerCase() === needle && preset.displayCount === displayCount) ??
    presets.find((preset) => preset.name.trim().toLowerCase() === needle && preset.displayCount == null)
  );
}

export function spaceNotes(candidates: CaptureCandidate[]): string[] {
  const maxByRole = new Map<DisplayRole, number>();
  for (const candidate of candidates) {
    maxByRole.set(candidate.display, Math.max(maxByRole.get(candidate.display) ?? 1, candidate.spaceIndex));
  }
  return [...maxByRole.entries()]
    .filter(([, count]) => count > 1)
    .map(([role, count]) => `${shortRoleTitle(role)} has ${count} Spaces`);
}

/** Round-trip helper used by tests: named inference must survive regionToRect. */
export function namedRegionFromRect(visible: Rect, name: NamedRegion): Region {
  return inferWindowRegion(visible, regionToRect(visible, { kind: "named", name }));
}
