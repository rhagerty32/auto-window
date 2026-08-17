import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampSpaceIndex,
  deskLabel,
  groupSlotsBySpace,
  matchesDesk,
  selectPresetForDesk,
  spaceSubtitle,
  usesMultipleSpaces,
} from "./spaces";
import type { Preset, WindowSlot } from "./types";

function slot(partial: Partial<WindowSlot> & Pick<WindowSlot, "id" | "display">): WindowSlot {
  return {
    bundleId: "app",
    appName: "App",
    titleContains: "",
    region: { kind: "named", name: "fill" },
    launchIfNeeded: true,
    spaceIndex: 1,
    ...partial,
  };
}

const work: Preset = {
  id: "work",
  name: "Work",
  isDefault: true,
  displayCount: 4,
  slots: [
    slot({ id: "dia", display: "largest", appName: "Dia" }),
    slot({ id: "discord", display: "rightmost", appName: "Discord", spaceIndex: 1 }),
    slot({ id: "mail", display: "rightmost", appName: "Mail", spaceIndex: 2 }),
  ],
};

const laptop: Preset = {
  id: "laptop",
  name: "Laptop",
  isDefault: true,
  displayCount: 1,
  slots: [slot({ id: "cursor", display: "builtin", appName: "Cursor" })],
};

const legacy: Preset = {
  id: "legacy",
  name: "Old Work",
  isDefault: true,
  slots: [slot({ id: "x", display: "main" })],
};

describe("selectPresetForDesk", () => {
  it("picks the default for the matching display count", () => {
    assert.equal(selectPresetForDesk([work, laptop], 4)?.id, "work");
    assert.equal(selectPresetForDesk([work, laptop], 1)?.id, "laptop");
  });

  it("falls back to a legacy preset with no displayCount", () => {
    assert.equal(selectPresetForDesk([legacy, work], 1)?.id, "legacy");
    assert.equal(selectPresetForDesk([work], 1), undefined);
  });
});

describe("groupSlotsBySpace", () => {
  it("applies rightmost Space 1 before Space 2", () => {
    const groups = groupSlotsBySpace(work.slots);
    const right = groups.filter((g) => g.display === "rightmost");
    assert.deepEqual(
      right.map((g) => [g.spaceIndex, g.slots.map((s) => s.appName)]),
      [
        [1, ["Discord"]],
        [2, ["Mail"]],
      ],
    );
  });
});

describe("clampSpaceIndex", () => {
  it("clamps a missing Space 2 down to 1", () => {
    assert.deepEqual(clampSpaceIndex(2, 1), { index: 1, clamped: true });
    assert.deepEqual(clampSpaceIndex(2, 2), { index: 2, clamped: false });
  });
});

describe("desk copy", () => {
  it("mentions Spaces only when a monitor uses more than Space 1", () => {
    assert.equal(usesMultipleSpaces(work), true);
    assert.equal(usesMultipleSpaces(laptop), false);
    assert.equal(spaceSubtitle(work), "Rightmost Spaces 1–2");
    assert.equal(spaceSubtitle(laptop), undefined);
    assert.equal(deskLabel(work), "4 displays");
    assert.equal(deskLabel(legacy), "Any desk");
    assert.equal(matchesDesk(legacy, 1), true);
    assert.equal(matchesDesk(work, 1), false);
  });
});
