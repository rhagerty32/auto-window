import { ROLE_INFER_ORDER, shortRoleTitle, type DisplayRole, type Preset, type WindowSlot } from "./types";
import type { SpacesResponse } from "./helper";

export type SpaceGroup = {
  display: DisplayRole;
  spaceIndex: number;
  slots: WindowSlot[];
};

export function slotSpaceIndex(slot: WindowSlot): number {
  return slot.spaceIndex && slot.spaceIndex > 0 ? slot.spaceIndex : 1;
}

export function matchesDesk(preset: Preset, displayCount: number): boolean {
  return preset.displayCount == null || preset.displayCount === displayCount;
}

export function selectPresetForDesk(presets: Preset[], displayCount: number): Preset | undefined {
  const exact = presets.filter((preset) => preset.displayCount === displayCount);
  if (exact.length > 0) {
    return exact.find((preset) => preset.isDefault) ?? exact[0];
  }
  const legacy = presets.filter((preset) => preset.displayCount == null);
  return legacy.find((preset) => preset.isDefault) ?? legacy[0];
}

export function sameDesk(a: Preset, b: Preset): boolean {
  return a.displayCount === b.displayCount;
}

export function groupSlotsBySpace(slots: WindowSlot[]): SpaceGroup[] {
  const groups: SpaceGroup[] = [];
  const index = new Map<string, SpaceGroup>();

  for (const slot of slots) {
    const spaceIndex = slotSpaceIndex(slot);
    const key = `${slot.display}:${spaceIndex}`;
    let group = index.get(key);
    if (!group) {
      group = { display: slot.display, spaceIndex, slots: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.slots.push(slot);
  }

  const roleOrder = new Map(ROLE_INFER_ORDER.map((role, i) => [role, i]));
  groups.sort((a, b) => {
    const roleDelta = (roleOrder.get(a.display) ?? 99) - (roleOrder.get(b.display) ?? 99);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return a.spaceIndex - b.spaceIndex;
  });
  return groups;
}

export function spaceCountForScreen(spaces: SpacesResponse, screenId: string): number {
  const display = spaces.displays.find((item) => item.screenId === screenId);
  return display?.spaces.length ?? 0;
}

export function clampSpaceIndex(index: number, spaceCount: number): { index: number; clamped: boolean } {
  if (spaceCount < 1) {
    return { index: Math.max(1, index), clamped: false };
  }
  if (index <= spaceCount) {
    return { index, clamped: false };
  }
  return { index: spaceCount, clamped: true };
}

export function usesMultipleSpaces(preset: Preset): boolean {
  return preset.slots.some((slot) => slotSpaceIndex(slot) > 1);
}

export function deskLabel(preset: Preset): string {
  if (preset.displayCount == null) {
    return "Any desk";
  }
  return `${preset.displayCount} display${preset.displayCount === 1 ? "" : "s"}`;
}

export function spaceSubtitle(preset: Preset): string | undefined {
  if (!usesMultipleSpaces(preset)) {
    return undefined;
  }
  const maxByRole = new Map<DisplayRole, number>();
  for (const slot of preset.slots) {
    const n = slotSpaceIndex(slot);
    maxByRole.set(slot.display, Math.max(maxByRole.get(slot.display) ?? 1, n));
  }
  const multi = [...maxByRole.entries()].filter(([, n]) => n > 1);
  if (multi.length === 0) {
    return undefined;
  }
  return multi.map(([role, n]) => `${shortRoleTitle(role)} Spaces 1–${n}`).join(" · ");
}
