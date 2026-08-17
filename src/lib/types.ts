export type DisplayRole = "builtin" | "rightmost" | "leftmost" | "largest" | "main";

export type NamedRegion = "fill" | "large" | "bottom-two-thirds" | "top-third" | "left-half" | "right-half";

export type Region =
  { kind: "named"; name: NamedRegion } | { kind: "percent"; x: number; y: number; w: number; h: number };

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Screen = {
  id: string;
  uuid?: string | null;
  isBuiltin: boolean;
  isMain: boolean;
  frame: Rect;
  visibleFrame: Rect;
};

export type WindowSlot = {
  id: string;
  bundleId: string;
  appName: string;
  titleContains: string;
  display: DisplayRole;
  region: Region;
  launchIfNeeded: boolean;
  spaceIndex?: number;
  fullscreen?: boolean;
  /** Higher = closer to front. From CGWindowList at capture. */
  zIndex?: number;
};

export type PresetDisplay = {
  role: DisplayRole;
  activeSpaceIndex: number;
  /** True when the display's current Mission Control desktop was a native-fullscreen app. */
  activeFullscreen?: boolean;
};

export type Preset = {
  id: string;
  name: string;
  isDefault: boolean;
  displayCount?: number;
  separateSpaces?: boolean;
  displays?: PresetDisplay[];
  slots: WindowSlot[];
  /** 1–8. Maps to the Apply Layout N command so it can have a Raycast hotkey. */
  commandSlot?: number;
};

export type PresetState = {
  presets: Preset[];
};

export const DISPLAY_ROLES: { value: DisplayRole; title: string }[] = [
  { value: "builtin", title: "Builtin (laptop)" },
  { value: "largest", title: "Largest" },
  { value: "main", title: "Main (menu bar)" },
  { value: "rightmost", title: "Rightmost" },
  { value: "leftmost", title: "Leftmost" },
];

export const ROLE_INFER_ORDER: DisplayRole[] = ["builtin", "rightmost", "leftmost", "largest", "main"];

export const NAMED_REGIONS: { value: NamedRegion; title: string }[] = [
  { value: "fill", title: "Fill display" },
  { value: "large", title: "Large (90% inset)" },
  { value: "bottom-two-thirds", title: "Bottom two thirds" },
  { value: "top-third", title: "Top third" },
  { value: "left-half", title: "Left half" },
  { value: "right-half", title: "Right half" },
];

export function roleTitle(role: DisplayRole): string {
  return DISPLAY_ROLES.find((r) => r.value === role)?.title ?? role;
}

export function shortRoleTitle(role: DisplayRole): string {
  switch (role) {
    case "builtin":
      return "Builtin";
    case "largest":
      return "Largest";
    case "main":
      return "Main";
    case "rightmost":
      return "Rightmost";
    case "leftmost":
      return "Leftmost";
  }
}
