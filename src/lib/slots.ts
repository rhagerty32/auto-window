import type { Preset } from "./types";

export const LAYOUT_SLOT_COUNT = 8;

export function isLayoutSlot(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LAYOUT_SLOT_COUNT;
}

export function layoutSlotFromCommandName(commandName: string): number | undefined {
  const match = /^apply-layout-(\d+)$/.exec(commandName);
  if (!match) {
    return undefined;
  }
  const slot = Number(match[1]);
  return isLayoutSlot(slot) ? slot : undefined;
}

export function nextCommandSlot(presets: Preset[]): number | undefined {
  const used = new Set(presets.map((preset) => preset.commandSlot).filter(isLayoutSlot));
  for (let slot = 1; slot <= LAYOUT_SLOT_COUNT; slot++) {
    if (!used.has(slot)) {
      return slot;
    }
  }
  return undefined;
}

export function getPresetBySlot(presets: Preset[], slot: number): Preset | undefined {
  if (!isLayoutSlot(slot)) {
    return undefined;
  }
  return presets.find((preset) => preset.commandSlot === slot);
}

export function findPresetByName(presets: Preset[], raw: string): Preset | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  const named = presets.filter((preset) => preset.name.trim().toLowerCase() === needle);
  if (named.length === 1) {
    return named[0];
  }
  if (named.length > 1) {
    return named.find((preset) => preset.isDefault) ?? named[0];
  }
  const asSlot = Number.parseInt(needle, 10);
  if (isLayoutSlot(asSlot) && String(asSlot) === needle) {
    return getPresetBySlot(presets, asSlot);
  }
  return undefined;
}

/** Keep existing slots; give unassigned presets the lowest free 1–8. First occupant wins duplicates. */
export function ensureCommandSlots(presets: Preset[]): Preset[] {
  const used = new Set<number>();
  return presets.map((preset) => {
    if (isLayoutSlot(preset.commandSlot) && !used.has(preset.commandSlot)) {
      used.add(preset.commandSlot);
      return preset;
    }
    for (let slot = 1; slot <= LAYOUT_SLOT_COUNT; slot++) {
      if (!used.has(slot)) {
        used.add(slot);
        return { ...preset, commandSlot: slot };
      }
    }
    return { ...preset, commandSlot: undefined };
  });
}

export function commandSlotsChanged(before: Preset[], after: Preset[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return after.some(
    (preset, index) => preset.id !== before[index]?.id || preset.commandSlot !== before[index]?.commandSlot,
  );
}
