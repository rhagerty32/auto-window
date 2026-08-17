import type { DisplayRole, NamedRegion, Rect, Region, Screen } from "./types";

function area(rect: Rect): number {
  return rect.width * rect.height;
}

function rightEdge(rect: Rect): number {
  return rect.x + rect.width;
}

export type ResolveResult = {
  screen: Screen;
  fallback?: DisplayRole;
};

export function resolveScreen(screens: Screen[], role: DisplayRole): ResolveResult | undefined {
  if (screens.length === 0) {
    return undefined;
  }

  const main = screens.find((s) => s.isMain) ?? screens[0];

  switch (role) {
    case "builtin": {
      const builtin = screens.find((s) => s.isBuiltin);
      if (builtin) {
        return { screen: builtin };
      }
      return { screen: main, fallback: "main" };
    }
    case "main":
      return { screen: main };
    case "largest": {
      const sorted = [...screens].sort((a, b) => {
        const delta = area(b.visibleFrame) - area(a.visibleFrame);
        if (delta !== 0) {
          return delta;
        }
        return b.visibleFrame.x - a.visibleFrame.x;
      });
      return { screen: sorted[0] };
    }
    case "rightmost": {
      const sorted = [...screens].sort((a, b) => {
        const delta = rightEdge(b.visibleFrame) - rightEdge(a.visibleFrame);
        if (delta !== 0) {
          return delta;
        }
        return b.visibleFrame.x - a.visibleFrame.x;
      });
      return { screen: sorted[0] };
    }
    case "leftmost": {
      const sorted = [...screens].sort((a, b) => a.visibleFrame.x - b.visibleFrame.x);
      return { screen: sorted[0] };
    }
    default:
      return undefined;
  }
}

export function regionFractions(region: Region): { x: number; y: number; w: number; h: number } {
  if (region.kind === "percent") {
    return { x: region.x, y: region.y, w: region.w, h: region.h };
  }
  return namedRegionFractions(region.name);
}

export function namedRegionFractions(name: NamedRegion): { x: number; y: number; w: number; h: number } {
  switch (name) {
    case "fill":
      return { x: 0, y: 0, w: 1, h: 1 };
    case "large":
      return { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    case "bottom-two-thirds":
      return { x: 0, y: 1 / 3, w: 1, h: 2 / 3 };
    case "top-third":
      return { x: 0, y: 0, w: 1, h: 1 / 3 };
    case "left-half":
      return { x: 0, y: 0, w: 0.5, h: 1 };
    case "right-half":
      return { x: 0.5, y: 0, w: 0.5, h: 1 };
  }
}

export function regionToRect(visible: Rect, region: Region): Rect {
  const f = regionFractions(region);
  return {
    x: visible.x + f.x * visible.width,
    y: visible.y + f.y * visible.height,
    width: f.w * visible.width,
    height: f.h * visible.height,
  };
}

export function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}
