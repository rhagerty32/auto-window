import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickWindow, pickWindowForApply, titleMatches } from "./pick";
import type { HelperWindow } from "./helper";

function window(partial: Partial<HelperWindow> & Pick<HelperWindow, "id" | "frame">): HelperWindow {
  return {
    pid: 1,
    index: 0,
    bundleId: "app",
    appName: "App",
    title: "",
    positionable: true,
    role: "AXWindow",
    subrole: "AXStandardWindow",
    ...partial,
  };
}

describe("titleMatches", () => {
  it("matches a truncated capture needle against a live title", () => {
    assert.equal(titleMatches("Everyday: (16) Financial Audit", "Everyday: (16) Financial…"), true);
    assert.equal(titleMatches("Everyday: (16) 7 Days Later", "Everyday: (16) Financial…"), false);
  });
});

describe("pickWindow", () => {
  const financial = window({
    id: "cg:157",
    cgWindowId: 157,
    bundleId: "company.thebrowser.dia",
    title: "Everyday: (16) Financial…",
    fullScreen: false,
    frame: { x: 0, y: 33, width: 1728, height: 982 },
  });
  const days = window({
    id: "cg:5903",
    cgWindowId: 5903,
    bundleId: "company.thebrowser.dia",
    title: "Everyday: (16) 7 Days Li…",
    fullScreen: true,
    frame: { x: 0, y: 33, width: 1728, height: 1084 },
  });

  it("picks the native-fullscreen window for a fullscreen slot even if the tab title changed", () => {
    const picked = pickWindow([financial, days], "Everyday: (16) Financial…", { fullscreen: true });
    assert.equal(picked?.window.id, "cg:5903");
    assert.equal(picked?.fallback, false);
  });

  it("picks the windowed Dia for a fill slot even when the stored title is a stale tab", () => {
    const picked = pickWindow([financial, days], "Everyday: (16) Financial…", { fullscreen: false });
    assert.equal(picked?.window.id, "cg:157");
    assert.equal(picked?.fallback, false);
  });

  it("does not steal a fullscreen window for a tiled slot", () => {
    const picked = pickWindow([financial, days], "", {
      fullscreen: false,
      exclude: new Set(["cg:157"]),
    });
    assert.equal(picked, undefined);
  });

  it("does not treat a missing screenId as matching the target display", () => {
    const onLaptop = window({
      id: "cursor-laptop",
      screenId: "1",
      title: "Agents",
      frame: { x: 0, y: 33, width: 800, height: 600 },
    });
    const unknown = window({
      id: "cursor-ghost",
      title: "Agents",
      frame: { x: 2000, y: 0, width: 1600, height: 900 },
    });
    const picked = pickWindow([unknown, onLaptop], "Agents", { screenId: "1" });
    assert.equal(picked?.window.id, "cursor-laptop");
  });

  it("does not pick a 500×500 WindowServer ghost", () => {
    const ghost = window({
      id: "cg:11603",
      bundleId: "com.mitchellh.ghostty",
      title: "",
      subrole: "CGWindow",
      frame: { x: 0, y: 617, width: 500, height: 500 },
    });
    const real = window({
      id: "76507:0",
      bundleId: "com.mitchellh.ghostty",
      title: "~",
      frame: { x: 478, y: 250, width: 771, height: 549 },
    });
    assert.equal(pickWindowForApply([ghost], ""), undefined);
    assert.equal(pickWindowForApply([ghost, real], "")?.id, "76507:0");
  });

  it("skips apply when a required title does not match", () => {
    const editor = window({
      id: "cursor-editor",
      bundleId: "com.todesktop.230313mzl4w4u92",
      title: "main.ts",
      frame: { x: 0, y: 33, width: 1728, height: 982 },
    });
    assert.equal(pickWindowForApply([editor], "Agents"), undefined);
    assert.equal(pickWindow([editor], "Agents")?.fallback, true);
  });
});
