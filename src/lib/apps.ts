import type { Application } from "@raycast/api";

function pathScore(path: string): number {
  if (path.startsWith("/Applications/")) {
    return 0;
  }
  if (path.startsWith("/System/Applications/")) {
    return 1;
  }
  return 2;
}

/** macOS reports some apps twice (same bundle id, different paths). Dropdown keys must be unique. */
export function uniqueApplications(apps: Application[]): Application[] {
  const byId = new Map<string, Application>();
  for (const app of apps) {
    const id = app.bundleId;
    if (!id) {
      continue;
    }
    const existing = byId.get(id);
    if (!existing || pathScore(app.path) < pathScore(existing.path)) {
      byId.set(id, app);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
