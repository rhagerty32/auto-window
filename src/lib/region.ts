import { NAMED_REGIONS, type NamedRegion, type Region } from "./types";

export function isNamedRegion(value: unknown): value is NamedRegion {
  return typeof value === "string" && NAMED_REGIONS.some((item) => item.value === value);
}

/** Flatten nested `{ kind: "named", name: { kind, name } }` from a bad dropdown save. */
export function normalizeRegion(region: unknown): Region {
  if (isNamedRegion(region)) {
    return { kind: "named", name: region };
  }
  if (!region || typeof region !== "object") {
    return { kind: "named", name: "fill" };
  }

  const raw = region as Record<string, unknown>;
  if (raw.kind === "percent") {
    return {
      kind: "percent",
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      w: Number(raw.w) || 1,
      h: Number(raw.h) || 1,
    };
  }

  let name: unknown = raw.kind === "named" ? raw.name : raw;
  for (let i = 0; i < 5 && name && typeof name === "object"; i++) {
    const inner = name as Record<string, unknown>;
    name = inner.name ?? inner.value;
  }

  if (isNamedRegion(name)) {
    return { kind: "named", name };
  }
  return { kind: "named", name: "fill" };
}

export function regionFormValue(region: unknown): string {
  const normalized = normalizeRegion(region);
  return normalized.kind === "named" ? normalized.name : "custom";
}
