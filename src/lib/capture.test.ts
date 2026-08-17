import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidates,
  captureDisplays,
  captureGroups,
  candidateToSlot,
  findPresetToUpdate,
  inferRole,
  inferTitleContains,
  inferWindowRegion,
  looksNativeFullscreen,
  namedRegionFromRect,
  storedTitleContains,
  suggestedCaptureName,
} from "./capture";
import { namedRegionFractions, regionToRect } from "./resolve";
import type { HelperWindow } from "./helper";
import type { Preset, Screen } from "./types";

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

function window(partial: Partial<HelperWindow> & Pick<HelperWindow, "id" | "frame">): HelperWindow {
  return {
    pid: 1,
    index: 0,
    bundleId: "com.example.app",
    appName: "App",
    title: "",
    positionable: true,
    role: "AXWindow",
    subrole: "AXStandardWindow",
    ...partial,
  };
}

describe("inferRole", () => {
  it("round-trips builtin, largest, rightmost, and leftmost on a 4-display desk", () => {
    assert.equal(inferRole(desk, "laptop"), "builtin");
    assert.equal(inferRole(desk, "center"), "largest");
    assert.equal(inferRole(desk, "right"), "rightmost");
    assert.equal(inferRole(desk, "left"), "leftmost");
  });

  it("prefers builtin on a single laptop display", () => {
    const laptop = desk.filter((s) => s.id === "laptop");
    assert.equal(inferRole(laptop, "laptop"), "builtin");
  });

  it("uses rightmost when a single display is not builtin", () => {
    const only = desk.filter((s) => s.id === "center");
    assert.equal(inferRole(only, "center"), "rightmost");
  });
});

describe("inferWindowRegion", () => {
  const visible = { x: 2560, y: 0, width: 1920, height: 1080 };

  it("maps named regions through regionToRect", () => {
    assert.deepEqual(namedRegionFromRect(visible, "fill"), { kind: "named", name: "fill" });
    assert.deepEqual(namedRegionFromRect(visible, "large"), { kind: "named", name: "large" });
    assert.deepEqual(namedRegionFromRect(visible, "bottom-two-thirds"), {
      kind: "named",
      name: "bottom-two-thirds",
    });
    assert.deepEqual(namedRegionFromRect(visible, "left-half"), { kind: "named", name: "left-half" });
  });

  it("treats near-full coverage as fill", () => {
    const frame = {
      x: visible.x + 10,
      y: visible.y + 10,
      width: visible.width - 20,
      height: visible.height - 20,
    };
    assert.deepEqual(inferWindowRegion(visible, frame), { kind: "named", name: "fill" });
  });

  it("stores unmatched geometry as percent with 3 decimals", () => {
    const frame = regionToRect(visible, { kind: "percent", x: 0.1234, y: 0.2, w: 0.4, h: 0.5 });
    const region = inferWindowRegion(visible, frame);
    assert.equal(region.kind, "percent");
    if (region.kind === "percent") {
      assert.equal(region.x, 0.123);
      assert.equal(region.y, 0.2);
      assert.equal(region.w, 0.4);
      assert.equal(region.h, 0.5);
    }
  });

  it("matches large within 0.08 tolerance", () => {
    const f = namedRegionFractions("large");
    const frame = {
      x: visible.x + (f.x + 0.03) * visible.width,
      y: visible.y + (f.y + 0.03) * visible.height,
      width: (f.w - 0.02) * visible.width,
      height: (f.h - 0.02) * visible.height,
    };
    assert.deepEqual(inferWindowRegion(visible, frame), { kind: "named", name: "large" });
  });
});

describe("inferTitleContains", () => {
  it("is empty when a bundle id appears once", () => {
    const titles = inferTitleContains([{ id: "a", bundleId: "com.hnc.Discord", title: "Discord" }]);
    assert.equal(titles.a, "");
  });

  it("keeps titles when the same app has two windows", () => {
    const titles = inferTitleContains([
      { id: "a", bundleId: "com.todesktop.cursor", title: "Agents" },
      { id: "b", bundleId: "com.todesktop.cursor", title: "main.ts" },
    ]);
    assert.equal(titles.a, "Agents");
    assert.equal(titles.b, "main.ts");
  });

  it("does not pin Dia slots to a tab title", () => {
    const titles = inferTitleContains([
      { id: "a", bundleId: "company.thebrowser.dia", title: "Everyday: (16) Financial…" },
      { id: "b", bundleId: "company.thebrowser.dia", title: "Everyday: (16) 7 Days Li…" },
    ]);
    assert.equal(titles.a, "");
    assert.equal(titles.b, "");
    assert.equal(storedTitleContains("company.thebrowser.dia", "Everyday: (16) Financial…"), "");
    assert.equal(storedTitleContains("com.todesktop.230313mzl4w4u92", "Agents"), "Agents");
  });
});

describe("buildCandidates", () => {
  it("groups Discord and Mail on the rightmost display by Space", () => {
    const windows = [
      window({
        id: "1:0",
        bundleId: "com.hnc.Discord",
        appName: "Discord",
        screenId: "right",
        spaceIndex: 1,
        frame: { x: 2560, y: 360, width: 1920, height: 720 },
      }),
      window({
        id: "2:0",
        bundleId: "com.apple.mail",
        appName: "Mail",
        screenId: "right",
        spaceIndex: 2,
        frame: { x: 2560, y: 0, width: 1920, height: 1080 },
      }),
    ];
    const candidates = buildCandidates(windows, desk);
    assert.equal(candidates[0].display, "rightmost");
    assert.equal(candidates[0].spaceIndex, 1);
    assert.equal(candidates[1].spaceIndex, 2);
    const groups = captureGroups(candidates, true);
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Rightmost · Space 1", "Rightmost · Space 2"],
    );
  });

  it("treats a frame that covers the display as native fullscreen", () => {
    const laptop = desk.find((s) => s.id === "laptop");
    assert.ok(laptop);
    assert.equal(looksNativeFullscreen(laptop.frame, laptop), true);
    assert.equal(looksNativeFullscreen(laptop.visibleFrame, laptop), false);
  });

  it("treats a window under the menu bar as native fullscreen", () => {
    const display = screen({
      id: "retina",
      isMain: true,
      frame: { x: 0, y: 0, width: 1728, height: 1117 },
      visibleFrame: { x: 0, y: 33, width: 1728, height: 982 },
    });
    assert.equal(looksNativeFullscreen({ x: 0, y: 33, width: 1728, height: 1084 }, display), true);
  });

  it("drops dialogs and untitled CG ghosts when a real window exists", () => {
    const windows = [
      window({
        id: "1122:0",
        bundleId: "company.thebrowser.dia",
        appName: "Dia",
        subrole: "AXSystemDialog",
        title: "",
        screenId: "laptop",
        frame: { x: 895, y: 43, width: 823, height: 463 },
      }),
      window({
        id: "cg:5903",
        bundleId: "company.thebrowser.dia",
        appName: "Dia",
        subrole: "CGWindow",
        title: "Shift5: Publishing overview",
        screenId: "laptop",
        frame: { x: 0, y: 33, width: 1728, height: 1084 },
      }),
      window({
        id: "15753:0",
        bundleId: "com.mitchellh.ghostty",
        appName: "Ghostty",
        subrole: "AXStandardWindow",
        title: "project",
        screenId: "laptop",
        frame: { x: 672, y: 380, width: 835, height: 568 },
      }),
      window({
        id: "cg:9419",
        bundleId: "com.mitchellh.ghostty",
        appName: "Ghostty",
        subrole: "CGWindow",
        title: "",
        screenId: "laptop",
        frame: { x: 0, y: 617, width: 500, height: 500 },
      }),
    ];
    const candidates = buildCandidates(windows, desk);
    assert.deepEqual(
      candidates.map((c) => c.id),
      ["cg:5903", "15753:0"],
    );
  });

  it("drops 500×500 WindowServer ghosts even when they look like standard windows", () => {
    const windows = [
      window({
        id: "15753:0",
        bundleId: "com.mitchellh.ghostty",
        appName: "Ghostty",
        subrole: "AXStandardWindow",
        title: "project",
        screenId: "laptop",
        frame: { x: 672, y: 380, width: 835, height: 568 },
      }),
      window({
        id: "15753:1",
        bundleId: "com.mitchellh.ghostty",
        appName: "Ghostty",
        subrole: "AXStandardWindow",
        title: "",
        screenId: "laptop",
        frame: { x: 0, y: 617, width: 500, height: 500 },
      }),
    ];
    const candidates = buildCandidates(windows, desk);
    assert.deepEqual(
      candidates.map((c) => c.id),
      ["15753:0"],
    );
  });

  it("stores stack order and lists front windows first on the same Space", () => {
    const windows = [
      window({
        id: "m:0",
        bundleId: "com.apple.MobileSMS",
        appName: "Messages",
        screenId: "laptop",
        stackIndex: 4,
        frame: { x: 620, y: 1500, width: 700, height: 500 },
      }),
      window({
        id: "d:0",
        bundleId: "company.thebrowser.dia",
        appName: "Dia",
        screenId: "laptop",
        stackIndex: 20,
        frame: { x: 520, y: 1440, width: 1512, height: 945 },
      }),
    ];
    const candidates = buildCandidates(windows, desk);
    assert.deepEqual(
      candidates.map((c) => [c.appName, c.zIndex]),
      [
        ["Dia", 20],
        ["Messages", 4],
      ],
    );
    assert.equal(candidateToSlot(candidates[0]).zIndex, 20);
  });
});

describe("captureDisplays", () => {
  it("records when the current desktop is a native-fullscreen app", () => {
    const displays = captureDisplays(desk, {
      available: true,
      separateSpaces: true,
      displays: [
        {
          uuid: "u",
          screenId: "laptop",
          activeIndex: 1,
          activeFullscreen: true,
          spaces: [{ index: 1, id: "1", type: 0 }],
        },
      ],
    });
    assert.equal(displays[0]?.role, "builtin");
    assert.equal(displays[0]?.activeFullscreen, true);
  });
});

describe("suggestedCaptureName", () => {
  it("names 4-display Work and 1-display Laptop", () => {
    assert.equal(suggestedCaptureName(4), "Work");
    assert.equal(suggestedCaptureName(1), "Laptop");
    assert.equal(suggestedCaptureName(2), "Desk (2 displays)");
  });
});

describe("findPresetToUpdate", () => {
  const presets: Preset[] = [
    { id: "work", name: "Work", isDefault: true, displayCount: 4, slots: [] },
    { id: "legacy", name: "Desk", isDefault: false, slots: [] },
  ];

  it("updates the same name on the same desk", () => {
    assert.equal(findPresetToUpdate(presets, "Work", 4)?.id, "work");
  });

  it("falls back to a legacy same-name preset", () => {
    assert.equal(findPresetToUpdate(presets, "Desk", 2)?.id, "legacy");
  });
});
