import { Action, ActionPanel, Form, Icon, getApplications, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { uniqueApplications } from "./lib/apps";
import { isVolatileTitleBundle, storedTitleContains } from "./lib/capture";
import { debugLog } from "./lib/debug";
import { getPreset, upsertPreset } from "./lib/presets";
import { normalizeRegion, regionFormValue } from "./lib/region";
import { DISPLAY_ROLES, NAMED_REGIONS, type DisplayRole, type Region, type WindowSlot } from "./lib/types";

export function EditPresetView({ presetId, onSave }: { presetId: string; onSave: () => void }) {
  const { pop } = useNavigation();
  const [name, setName] = useState<string>();
  const [isDefault, setIsDefault] = useState<boolean>();
  const [displayCount, setDisplayCount] = useState<number | undefined>();
  const [commandSlot, setCommandSlot] = useState<number | undefined>();

  const { isLoading } = usePromise(getPreset, [presetId], {
    onData: (preset) => {
      if (!preset) {
        return;
      }
      setName(preset.name);
      setIsDefault(preset.isDefault);
      setDisplayCount(preset.displayCount);
      setCommandSlot(preset.commandSlot);
    },
  });

  async function save(values: { name: string; isDefault: boolean }) {
    const preset = await getPreset(presetId);
    if (!preset) {
      return;
    }
    await upsertPreset({
      ...preset,
      name: values.name.trim() || "Untitled",
      isDefault: values.isDefault,
    });
    onSave();
    pop();
  }

  return (
    <Form
      key={name === undefined ? "loading" : "ready"}
      isLoading={isLoading}
      navigationTitle="Edit Preset"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Preset" icon={Icon.Check} onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" value={name} onChange={setName} />
      <Form.Checkbox
        id="isDefault"
        title="Default"
        label={
          displayCount == null
            ? "Apply with Apply Default Preset on any desk"
            : `Default for ${displayCount} display${displayCount === 1 ? "" : "s"}`
        }
        value={isDefault}
        onChange={setIsDefault}
      />
      {commandSlot ? (
        <Form.Description
          text={`Hotkey command: Apply Layout ${commandSlot}. Assign a shortcut in Raycast settings.`}
        />
      ) : (
        <Form.Description text="No Apply Layout slot assigned (all 8 are in use)." />
      )}
    </Form>
  );
}

function parseSpaceIndex(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseZIndex(raw: string | undefined): number | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : undefined;
}

function nextRegion(valuesRegion: unknown, current?: WindowSlot): Region {
  debugLog("edit-slot.save-region", {
    valuesRegion,
    valuesType: typeof valuesRegion,
    current: current?.region,
  });
  if (valuesRegion && typeof valuesRegion === "object") {
    return normalizeRegion(valuesRegion);
  }
  const name = String(valuesRegion ?? "fill");
  if (name === "custom" && current?.region.kind === "percent") {
    return current.region;
  }
  if (name === "custom") {
    return { kind: "named", name: "fill" };
  }
  return normalizeRegion({ kind: "named", name });
}

export function EditSlotView({ presetId, slotId, onSave }: { presetId: string; slotId: string; onSave: () => void }) {
  const { pop } = useNavigation();
  const [bundleId, setBundleId] = useState<string>();
  const { data: apps, isLoading: appsLoading } = usePromise(getApplications, []);
  const { data: slot, isLoading: slotLoading } = usePromise(
    async (pid: string, sid: string) => {
      const preset = await getPreset(pid);
      const found = preset?.slots.find((s) => s.id === sid);
      debugLog("edit-slot.load", {
        presetId: pid,
        slotId: sid,
        region: found?.region,
        regionType: typeof found?.region,
        nameType:
          found?.region && typeof found.region === "object"
            ? typeof (found.region as { name?: unknown }).name
            : undefined,
        formValue: regionFormValue(found?.region),
      });
      return found;
    },
    [presetId, slotId],
  );

  async function save(values: {
    bundleId: string;
    titleContains?: string;
    display: string;
    regionName: string;
    spaceIndex: string;
    zIndex: string;
    launchIfNeeded: boolean;
    fullscreen: boolean;
  }) {
    const preset = await getPreset(presetId);
    if (!preset) {
      return;
    }
    const app = uniqueApplications(apps ?? []).find((a) => a.bundleId === values.bundleId);
    const nextSlot: WindowSlot = {
      id: slotId,
      bundleId: values.bundleId,
      appName: app?.name ?? slot?.appName ?? "",
      titleContains: storedTitleContains(values.bundleId, values.titleContains ?? ""),
      display: values.display as DisplayRole,
      region: nextRegion(values.regionName, slot),
      launchIfNeeded: values.launchIfNeeded,
      spaceIndex: parseSpaceIndex(values.spaceIndex),
      fullscreen: values.fullscreen,
      zIndex: parseZIndex(values.zIndex),
    };
    debugLog("edit-slot.save", { nextSlot });
    const slots = preset.slots.some((s) => s.id === slotId)
      ? preset.slots.map((s) => (s.id === slotId ? nextSlot : s))
      : [...preset.slots, nextSlot];
    await upsertPreset({ ...preset, slots });
    onSave();
    pop();
  }

  if (!slot) {
    return <Form isLoading={appsLoading || slotLoading} navigationTitle="Edit Window" />;
  }

  const regionValue = regionFormValue(slot.region);
  const showCustom = slot.region.kind === "percent" || regionValue === "custom";
  const selectedBundle = bundleId ?? slot.bundleId;
  const ignoreTabTitle = isVolatileTitleBundle(selectedBundle);

  return (
    <Form
      key={slot.id}
      isLoading={appsLoading}
      navigationTitle={slot.appName ? `Edit ${slot.appName}` : "Edit Window"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Window" icon={Icon.Check} onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="bundleId" title="Application" value={selectedBundle || undefined} onChange={setBundleId}>
        {uniqueApplications(apps ?? []).map((app) => (
          <Form.Dropdown.Item
            key={app.bundleId}
            value={app.bundleId as string}
            title={app.name}
            icon={{ fileIcon: app.path }}
          />
        ))}
      </Form.Dropdown>
      {ignoreTabTitle ? (
        <Form.Description text="Tab titles are ignored for this browser. Multiple windows are told apart by windowed vs native fullscreen, not by the page title." />
      ) : (
        <Form.TextField
          id="titleContains"
          title="Title contains"
          placeholder="Agents"
          defaultValue={slot.titleContains}
          info="Optional. Used to pick Cursor Agents instead of the editor."
        />
      )}
      <Form.Dropdown id="display" title="Display role" defaultValue={slot.display ?? "main"}>
        {DISPLAY_ROLES.map((role) => (
          <Form.Dropdown.Item key={role.value} value={role.value} title={role.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="regionName" title="Region" defaultValue={regionValue}>
        {NAMED_REGIONS.map((item) => (
          <Form.Dropdown.Item key={item.value} value={item.value} title={item.title} />
        ))}
        {showCustom ? <Form.Dropdown.Item value="custom" title="Custom (from capture)" /> : null}
      </Form.Dropdown>
      <Form.TextField
        id="spaceIndex"
        title="Space"
        placeholder="1"
        defaultValue={String(slot.spaceIndex ?? 1)}
        info="Mission Control Space on that display. 1 is the first Space."
      />
      <Form.Checkbox
        id="fullscreen"
        title="Fullscreen"
        label="Native fullscreen (own Mission Control desktop)"
        defaultValue={slot.fullscreen ?? false}
      />
      <Form.TextField
        id="zIndex"
        title="Stack"
        placeholder="Frontness"
        defaultValue={slot.zIndex != null ? String(slot.zIndex) : ""}
        info="Higher numbers stay in front. Captured automatically from window order."
      />
      <Form.Checkbox
        id="launchIfNeeded"
        title="Launch"
        label="Open the app if it is not running"
        defaultValue={slot.launchIfNeeded ?? true}
      />
    </Form>
  );
}
