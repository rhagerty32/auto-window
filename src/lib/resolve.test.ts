import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { namedRegionFractions, regionToRect, resolveScreen, roundRect } from "./resolve";
import type { Screen } from "./types";

function screen(partial: Partial<Screen> & Pick<Screen, "id">): Screen {
  const frame = partial.frame ?? { x: 0, y: 0, width: 1920, height: 1080 };
  return {
    isBuiltin: false,
    isMain: false,
    frame,
    visibleFrame: partial.visibleFrame ?? frame,
    ...partial,
  };
}

const desk: Screen[] = [
  screen({
    id: "left",
    visibleFrame: { x: -1920, y: 0, width: 1920, height: 1080 },
  }),
  screen({
    id: "center",
    isMain: true,
    visibleFrame: { x: 0, y: 0, width: 2560, height: 1440 },
  }),
  screen({
    id: "right",
    visibleFrame: { x: 2560, y: 0, width: 1920, height: 1080 },
  }),
  screen({
    id: "laptop",
    isBuiltin: true,
    visibleFrame: { x: 520, y: 1440, width: 1512, height: 945 },
  }),
];

describe("resolveScreen", () => {
  it("picks builtin, largest, and rightmost by geometry", () => {
    assert.equal(resolveScreen(desk, "builtin")?.screen.id, "laptop");
    assert.equal(resolveScreen(desk, "largest")?.screen.id, "center");
    assert.equal(resolveScreen(desk, "rightmost")?.screen.id, "right");
    assert.equal(resolveScreen(desk, "leftmost")?.screen.id, "left");
    assert.equal(resolveScreen(desk, "main")?.screen.id, "center");
  });

  it("falls back from builtin to main when the lid is closed", () => {
    const lidClosed = desk.filter((s) => s.id !== "laptop");
    const result = resolveScreen(lidClosed, "builtin");
    assert.equal(result?.screen.id, "center");
    assert.equal(result?.fallback, "main");
  });
});

describe("regionToRect", () => {
  const visible = { x: 2560, y: 0, width: 1920, height: 1080 };

  it("maps bottom two thirds from the top-left origin", () => {
    const rect = regionToRect(visible, { kind: "named", name: "bottom-two-thirds" });
    assert.equal(rect.x, 2560);
    assert.ok(Math.abs(rect.y - 1080 / 3) < 1e-6);
    assert.equal(rect.width, 1920);
    assert.ok(Math.abs(rect.height - (1080 * 2) / 3) < 1e-6);
  });

  it("fills the visible frame", () => {
    const rect = regionToRect(visible, { kind: "named", name: "fill" });
    assert.deepEqual(rect, visible);
  });

  it("insets large to 90%", () => {
    const f = namedRegionFractions("large");
    assert.deepEqual(f, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    const rect = roundRect(regionToRect(visible, { kind: "named", name: "large" }));
    assert.deepEqual(rect, { x: 2656, y: 54, width: 1728, height: 972 });
  });
});
