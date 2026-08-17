import { isVolatileTitleBundle } from "./capture";
import type { HelperWindow } from "./helper";

export function windowKeys(window: HelperWindow): string[] {
  const keys = [window.id];
  if (window.cgWindowId) {
    keys.push(`cg:${window.cgWindowId}`);
  }
  if (window.pid && window.cgWindowId) {
    keys.push(`${window.pid}:${window.cgWindowId}`);
  }
  return keys;
}

export function titleMatches(title: string, needle: string): boolean {
  const haystack = title.toLowerCase().trim();
  const n = needle
    .toLowerCase()
    .replace(/[.…]+$/u, "")
    .trim();
  if (!n || !haystack) {
    return false;
  }
  const stripped = haystack.replace(/[.…]+$/u, "").trim();
  return haystack.includes(n) || stripped.includes(n) || n.includes(stripped) || stripped.startsWith(n);
}

function usableWindows(windows: HelperWindow[], exclude?: Set<string>): HelperWindow[] {
  return windows.filter((w) => {
    if (!w.positionable && !w.minimized) {
      return false;
    }
    if (w.subrole === "AXSystemDialog" || w.subrole === "AXDialog" || w.subrole === "AXSheet") {
      return false;
    }
    if (exclude && windowKeys(w).some((key) => exclude.has(key))) {
      return false;
    }
    return true;
  });
}

export function pickWindow(
  windows: HelperWindow[],
  titleContains: string,
  options?: { spaceIndex?: number; screenId?: string; exclude?: Set<string>; fullscreen?: boolean },
): { window: HelperWindow; fallback: boolean } | undefined {
  let usable = usableWindows(windows, options?.exclude);
  if (usable.length === 0) {
    return undefined;
  }

  if (options?.screenId) {
    const onScreen = usable.filter((w) => w.screenId === options.screenId);
    if (onScreen.length > 0) {
      usable = onScreen;
    }
  }

  if (options?.fullscreen) {
    const full = usable.filter((w) => w.fullScreen);
    if (full.length > 0) {
      usable = full;
    }
  } else if (options?.fullscreen === false) {
    usable = usable.filter((w) => !w.fullScreen);
  }

  if (usable.length === 0) {
    return undefined;
  }

  if (options?.spaceIndex != null && !options.fullscreen) {
    const onSpace = usable.filter((w) => (w.spaceIndex ?? 1) === options.spaceIndex);
    if (onSpace.length > 0) {
      usable = onSpace;
    }
  }

  const volatile = usable.some((w) => isVolatileTitleBundle(w.bundleId));
  const needle = volatile ? "" : titleContains.trim();
  if (needle) {
    const hit = usable.find((w) => titleMatches(w.title, needle));
    if (hit) {
      return { window: hit, fallback: false };
    }
  }

  const sorted = [...usable].sort((a, b) => {
    const aStd = a.subrole === "AXStandardWindow" ? 1 : 0;
    const bStd = b.subrole === "AXStandardWindow" ? 1 : 0;
    if (aStd !== bStd) {
      return bStd - aStd;
    }
    const aTitle = a.title.trim() ? 1 : 0;
    const bTitle = b.title.trim() ? 1 : 0;
    if (aTitle !== bTitle) {
      return bTitle - aTitle;
    }
    return b.frame.width * b.frame.height - a.frame.width * a.frame.height;
  });

  const picked = sorted[0];
  if (!picked) {
    return undefined;
  }
  // Fullscreen/windowed filter already chose the right window; a stale browser tab title is not a fallback.
  const fallback = Boolean(needle) && !(options?.fullscreen && picked.fullScreen);
  return { window: picked, fallback };
}

/** Apply never moves a window that only matched as a title-mismatch fallback. */
export function pickWindowForApply(
  windows: HelperWindow[],
  titleContains: string,
  options?: { spaceIndex?: number; screenId?: string; exclude?: Set<string>; fullscreen?: boolean },
): HelperWindow | undefined {
  const picked = pickWindow(windows, titleContains, options);
  if (!picked || picked.fallback) {
    return undefined;
  }
  return picked.window;
}
