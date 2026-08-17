import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";
import { storedTitleContains } from "./capture";
import { normalizeRegion } from "./region";
import { selectPresetForDesk, sameDesk } from "./spaces";
import { commandSlotsChanged, ensureCommandSlots, isLayoutSlot, nextCommandSlot } from "./slots";
import type { NamedRegion, Preset, PresetState, WindowSlot } from "./types";

const STORAGE_KEY = "presets-v1";

export const WORK_PRESET_ID = "work";

export function namedRegion(name: NamedRegion): WindowSlot["region"] {
  return { kind: "named", name };
}

export function seedState(): PresetState {
  return {
    presets: [
      {
        id: WORK_PRESET_ID,
        name: "Work",
        isDefault: true,
        commandSlot: 1,
        displayCount: 4,
        separateSpaces: true,
        displays: [
          { role: "largest", activeSpaceIndex: 1 },
          { role: "builtin", activeSpaceIndex: 1 },
          { role: "rightmost", activeSpaceIndex: 1 },
        ],
        slots: [
          {
            id: "work-dia",
            bundleId: "company.thebrowser.dia",
            appName: "Dia",
            titleContains: "",
            display: "largest",
            region: namedRegion("fill"),
            launchIfNeeded: true,
            spaceIndex: 1,
          },
          {
            id: "work-cursor",
            bundleId: "com.todesktop.230313mzl4w4u92",
            appName: "Cursor",
            titleContains: "Agents",
            display: "builtin",
            region: namedRegion("large"),
            launchIfNeeded: true,
            spaceIndex: 1,
          },
          {
            id: "work-discord",
            bundleId: "com.hnc.Discord",
            appName: "Discord",
            titleContains: "",
            display: "rightmost",
            region: namedRegion("bottom-two-thirds"),
            launchIfNeeded: true,
            spaceIndex: 1,
          },
        ],
      },
    ],
  };
}

export function emptyPreset(name = "Untitled"): Preset {
  return {
    id: randomUUID(),
    name,
    isDefault: false,
    slots: [],
  };
}

export function emptySlot(): WindowSlot {
  return {
    id: randomUUID(),
    bundleId: "",
    appName: "",
    titleContains: "",
    display: "main",
    region: namedRegion("fill"),
    launchIfNeeded: true,
    spaceIndex: 1,
    fullscreen: false,
  };
}

function normalizeSlot(slot: WindowSlot): WindowSlot {
  return {
    ...slot,
    titleContains: storedTitleContains(slot.bundleId, slot.titleContains ?? ""),
    region: normalizeRegion(slot.region),
    spaceIndex: slot.spaceIndex && slot.spaceIndex > 0 ? slot.spaceIndex : 1,
    launchIfNeeded: slot.launchIfNeeded ?? true,
    fullscreen: Boolean(slot.fullscreen),
    zIndex: typeof slot.zIndex === "number" && Number.isFinite(slot.zIndex) ? slot.zIndex : undefined,
  };
}

export function normalizePreset(preset: Preset): Preset {
  return {
    ...preset,
    displays: preset.displays?.map((display) => ({
      role: display.role,
      activeSpaceIndex: display.activeSpaceIndex && display.activeSpaceIndex > 0 ? display.activeSpaceIndex : 1,
      ...(display.activeFullscreen ? { activeFullscreen: true } : {}),
    })),
    commandSlot: isLayoutSlot(preset.commandSlot) ? preset.commandSlot : undefined,
    slots: (preset.slots ?? []).map(normalizeSlot),
  };
}

function parseState(raw: string): PresetState | undefined {
  try {
    const parsed = JSON.parse(raw) as PresetState;
    if (!parsed || !Array.isArray(parsed.presets)) {
      return undefined;
    }
    return { presets: parsed.presets.map(normalizePreset) };
  } catch {
    return undefined;
  }
}

function titlesNeedPersist(raw: string, state: PresetState): boolean {
  try {
    const parsed = JSON.parse(raw) as PresetState;
    return (parsed.presets ?? []).some((preset, presetIndex) =>
      (preset.slots ?? []).some((slot, slotIndex) => {
        const next = state.presets[presetIndex]?.slots[slotIndex];
        return next != null && (slot.titleContains ?? "") !== (next.titleContains ?? "");
      }),
    );
  } catch {
    return false;
  }
}

export async function loadState(): Promise<PresetState> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) {
    const seeded = seedState();
    await saveState(seeded);
    return seeded;
  }
  const parsed = parseState(raw);
  if (!parsed) {
    return seedState();
  }
  const presets = ensureCommandSlots(parsed.presets);
  if (commandSlotsChanged(parsed.presets, presets) || titlesNeedPersist(raw, parsed)) {
    const next = { presets };
    await saveStateRaw(next);
    return next;
  }
  return { presets };
}

export async function saveState(state: PresetState): Promise<void> {
  await saveStateRaw({ presets: state.presets.map(normalizePreset) });
}

async function saveStateRaw(state: PresetState): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function getPreset(id: string): Promise<Preset | undefined> {
  const state = await loadState();
  return state.presets.find((p) => p.id === id);
}

export async function getDefaultPreset(displayCount?: number): Promise<Preset | undefined> {
  const state = await loadState();
  if (displayCount != null) {
    return selectPresetForDesk(state.presets, displayCount);
  }
  return state.presets.find((p) => p.isDefault) ?? state.presets[0];
}

export async function upsertPreset(preset: Preset): Promise<PresetState> {
  const state = await loadState();
  let next = normalizePreset(preset);
  if (!isLayoutSlot(next.commandSlot)) {
    const others = state.presets.filter((item) => item.id !== next.id);
    next = { ...next, commandSlot: nextCommandSlot(others) };
  }
  const index = state.presets.findIndex((p) => p.id === next.id);
  let presets: Preset[];
  if (index === -1) {
    presets = [...state.presets, next];
  } else {
    presets = state.presets.map((p) => (p.id === next.id ? next : p));
  }
  if (next.isDefault) {
    presets = presets.map((p) => ({
      ...p,
      isDefault: p.id === next.id ? true : sameDesk(p, next) ? false : p.isDefault,
    }));
  }
  if (isLayoutSlot(next.commandSlot)) {
    presets = presets.map((p) =>
      p.id === next.id || p.commandSlot !== next.commandSlot ? p : { ...p, commandSlot: undefined },
    );
    presets = ensureCommandSlots(presets);
  }
  const saved = { presets };
  await saveStateRaw(saved);
  return saved;
}

export async function setDefaultPreset(id: string): Promise<PresetState> {
  const state = await loadState();
  const target = state.presets.find((p) => p.id === id);
  if (!target) {
    return state;
  }
  const saved = {
    presets: state.presets.map((p) => ({
      ...p,
      isDefault: p.id === id ? true : sameDesk(p, target) ? false : p.isDefault,
    })),
  };
  await saveStateRaw(saved);
  return saved;
}

export async function deletePreset(id: string): Promise<PresetState> {
  const state = await loadState();
  const removed = state.presets.find((p) => p.id === id);
  const remaining = state.presets.filter((p) => p.id !== id);
  if (removed && remaining.length > 0 && !remaining.some((p) => p.isDefault && sameDesk(p, removed))) {
    const sibling = remaining.find((p) => sameDesk(p, removed));
    if (sibling) {
      remaining[remaining.indexOf(sibling)] = { ...sibling, isDefault: true };
    }
  }
  const saved = { presets: remaining };
  await saveStateRaw(saved);
  return saved;
}

export async function duplicatePreset(id: string): Promise<Preset | undefined> {
  const source = await getPreset(id);
  if (!source) {
    return undefined;
  }
  const copy: Preset = {
    ...source,
    id: randomUUID(),
    name: `${source.name} copy`,
    isDefault: false,
    commandSlot: undefined,
    slots: source.slots.map((slot) => ({ ...slot, id: randomUUID() })),
  };
  await upsertPreset(copy);
  return getPreset(copy.id);
}

export function slotSummary(preset: Preset): string {
  if (preset.slots.length === 0) {
    return "No windows";
  }
  return preset.slots.map((s) => s.appName || s.bundleId || "App").join(" · ");
}
