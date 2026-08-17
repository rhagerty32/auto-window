import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureCommandSlots,
  findPresetByName,
  getPresetBySlot,
  layoutSlotFromCommandName,
  nextCommandSlot,
} from "./slots";
import type { Preset } from "./types";

function preset(partial: Partial<Preset> & Pick<Preset, "id" | "name">): Preset {
  return {
    isDefault: false,
    slots: [],
    ...partial,
  };
}

describe("layoutSlotFromCommandName", () => {
  it("reads Apply Layout N command names", () => {
    assert.equal(layoutSlotFromCommandName("apply-layout-3"), 3);
    assert.equal(layoutSlotFromCommandName("apply-layout-9"), undefined);
    assert.equal(layoutSlotFromCommandName("manage-presets"), undefined);
  });
});

describe("ensureCommandSlots", () => {
  it("keeps existing slots and fills the next free numbers", () => {
    const assigned = ensureCommandSlots([
      preset({ id: "work", name: "Work", commandSlot: 1 }),
      preset({ id: "laptop", name: "Laptop" }),
      preset({ id: "focus", name: "Focus", commandSlot: 1 }),
    ]);
    assert.deepEqual(
      assigned.map((item) => [item.id, item.commandSlot]),
      [
        ["work", 1],
        ["laptop", 2],
        ["focus", 3],
      ],
    );
  });

  it("returns the next free slot", () => {
    assert.equal(nextCommandSlot([preset({ id: "a", name: "A", commandSlot: 1 })]), 2);
    assert.equal(
      nextCommandSlot(
        Array.from({ length: 8 }, (_, index) =>
          preset({ id: String(index), name: String(index), commandSlot: index + 1 }),
        ),
      ),
      undefined,
    );
  });
});

describe("findPresetByName", () => {
  const presets = [
    preset({ id: "work", name: "Work", isDefault: true, commandSlot: 1 }),
    preset({ id: "laptop", name: "Laptop", commandSlot: 2 }),
  ];

  it("matches name case-insensitively", () => {
    assert.equal(findPresetByName(presets, "laptop")?.id, "laptop");
  });

  it("matches a layout slot number", () => {
    assert.equal(findPresetByName(presets, "1")?.id, "work");
    assert.equal(getPresetBySlot(presets, 2)?.id, "laptop");
  });
});
