import type { WindowSlot } from "./types";

/** Higher = closer to front. Captured from CGWindowList; legacy slots get a fill/fullscreen heuristic. */
export function slotZIndex(slot: WindowSlot): number {
  if (typeof slot.zIndex === "number" && Number.isFinite(slot.zIndex)) {
    return slot.zIndex;
  }
  let z = 0;
  if (slot.fullscreen) {
    z += 1_000_000;
  }
  if (slot.region.kind === "named" && slot.region.name === "fill") {
    z += 100_000;
  } else if (slot.region.kind === "named" && slot.region.name === "large") {
    z += 90_000;
  }
  return z;
}

export function compareSlotZIndex(a: WindowSlot, b: WindowSlot): number {
  return slotZIndex(a) - slotZIndex(b);
}

/**
 * After restore, raise windowed windows (and fill that failed native fullscreen).
 * Skip a still-native-fullscreen window unless capture said we were looking at it —
 * otherwise raising it yanks us off the desktop onto that app's Space.
 */
export function shouldRestackWindow(options: {
  fullscreenSlot: boolean;
  liveFullScreen: boolean;
  displayActiveFullscreen: boolean;
}): boolean {
  if (!options.fullscreenSlot) {
    return true;
  }
  if (options.displayActiveFullscreen) {
    return true;
  }
  return !options.liveFullScreen;
}
