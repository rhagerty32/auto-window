import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  LaunchType,
  List,
  launchCommand,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { createDeeplink, usePromise } from "@raycast/utils";
import { EditPresetView, EditSlotView } from "./edit-preset";
import { listScreens } from "./lib/helper";
import {
  emptyPreset,
  emptySlot,
  deletePreset,
  duplicatePreset,
  loadState,
  setDefaultPreset,
  slotSummary,
  upsertPreset,
} from "./lib/presets";
import { isLayoutSlot } from "./lib/slots";
import { deskLabel, matchesDesk, spaceSubtitle, slotSpaceIndex } from "./lib/spaces";
import { DISPLAY_ROLES, NAMED_REGIONS, type Preset, type WindowSlot } from "./lib/types";
import { reportApplyError, runPresetApply } from "./lib/run";

function roleTitle(role: WindowSlot["display"]): string {
  return DISPLAY_ROLES.find((r) => r.value === role)?.title ?? role;
}

function regionTitle(slot: WindowSlot): string {
  if (slot.fullscreen) {
    return "Fullscreen";
  }
  const region = slot.region;
  if (region.kind !== "named") {
    return "Custom";
  }
  const name = region.name;
  return NAMED_REGIONS.find((r) => r.value === name)?.title ?? name;
}

function slotSubtitle(slot: WindowSlot): string {
  const space = slotSpaceIndex(slot);
  const parts = [`${roleTitle(slot.display)} · ${regionTitle(slot)}`];
  if (!slot.fullscreen && space > 1) {
    parts.push(`Space ${space}`);
  }
  return parts.join(" · ");
}

function presetSubtitle(preset: Preset): string {
  const parts = [slotSummary(preset)];
  const spaces = spaceSubtitle(preset);
  if (spaces) {
    parts.push(spaces);
  }
  return parts.join(" · ");
}

export function SlotList({ presetId, onChange }: { presetId: string; onChange: () => void }) {
  const { push } = useNavigation();
  const { data: state, isLoading, revalidate } = usePromise(loadState, []);
  const preset = state?.presets.find((p) => p.id === presetId);

  async function refresh() {
    await revalidate();
    onChange();
  }

  async function addSlot() {
    const current = state?.presets.find((p) => p.id === presetId);
    if (!current) {
      return;
    }
    const slot = emptySlot();
    await upsertPreset({ ...current, slots: [...current.slots, slot] });
    await refresh();
    push(<EditSlotView presetId={presetId} slotId={slot.id} onSave={refresh} />);
  }

  async function removeSlot(slotId: string) {
    const current = state?.presets.find((p) => p.id === presetId);
    if (!current) {
      return;
    }
    const ok = await confirmAlert({
      title: "Remove window?",
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) {
      return;
    }
    await upsertPreset({ ...current, slots: current.slots.filter((s) => s.id !== slotId) });
    await refresh();
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={preset?.name ?? "Windows"}
      searchBarPlaceholder="Filter windows"
      actions={
        <ActionPanel>
          <Action title="Add Window" icon={Icon.Plus} onAction={addSlot} />
          <Action.Push
            title="Rename Preset"
            icon={Icon.Pencil}
            target={<EditPresetView presetId={presetId} onSave={refresh} />}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        icon={Icon.AppWindowList}
        title="No windows in this preset"
        description="Add Dia, Cursor, Discord, or any other app."
        actions={
          <ActionPanel>
            <Action title="Add Window" icon={Icon.Plus} onAction={addSlot} />
          </ActionPanel>
        }
      />
      {preset?.slots.map((slot) => (
        <List.Item
          key={slot.id}
          title={slot.appName || "Pick an app"}
          subtitle={slotSubtitle(slot)}
          accessories={slot.titleContains ? [{ text: slot.titleContains }] : []}
          actions={
            <ActionPanel>
              <Action.Push
                title="Edit Window"
                icon={Icon.Pencil}
                target={<EditSlotView presetId={presetId} slotId={slot.id} onSave={refresh} />}
              />
              <Action title="Add Window" icon={Icon.Plus} onAction={addSlot} />
              <Action
                title="Remove Window"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => removeSlot(slot.id)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function PresetItem({
  preset,
  displayCount,
  onApply,
  onRefresh,
  onCreate,
}: {
  preset: Preset;
  displayCount?: number;
  onApply: (preset: Preset) => void;
  onRefresh: () => void;
  onCreate: () => void;
}) {
  const mismatched = displayCount != null && !matchesDesk(preset, displayCount);
  const layoutCommand = isLayoutSlot(preset.commandSlot) ? `apply-layout-${preset.commandSlot}` : undefined;

  async function duplicate() {
    const copy = await duplicatePreset(preset.id);
    onRefresh();
    if (copy) {
      await showToast({ style: Toast.Style.Success, title: `Duplicated ${copy.name}` });
    }
  }

  async function remove() {
    const ok = await confirmAlert({
      title: `Delete ${preset.name}?`,
      message: "This cannot be undone.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) {
      return;
    }
    await deletePreset(preset.id);
    onRefresh();
  }

  return (
    <List.Item
      icon={Icon.Desktop}
      title={preset.name}
      subtitle={presetSubtitle(preset)}
      accessories={[
        ...(preset.isDefault ? [{ tag: { value: "Default", color: Color.Blue } }] : []),
        ...(isLayoutSlot(preset.commandSlot)
          ? [{ tag: { value: `Layout ${preset.commandSlot}`, color: Color.SecondaryText } }]
          : []),
        { text: deskLabel(preset) },
        { text: `${preset.slots.length} window${preset.slots.length === 1 ? "" : "s"}` },
      ]}
      actions={
        <ActionPanel>
          <Action title="Apply" icon={Icon.AppWindow} onAction={() => onApply(preset)} />
          <Action.Push
            title="Edit Windows"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<SlotList presetId={preset.id} onChange={onRefresh} />}
          />
          <Action.Push
            title="Rename Preset"
            icon={Icon.Text}
            target={<EditPresetView presetId={preset.id} onSave={onRefresh} />}
          />
          {layoutCommand ? (
            <Action.CreateQuicklink
              title="Add Hotkey Command"
              icon={Icon.Keyboard}
              quicklink={{
                name: preset.name,
                link: createDeeplink({ command: layoutCommand }),
              }}
            />
          ) : null}
          <Action
            title="Set as Default"
            icon={Icon.Star}
            onAction={async () => {
              await setDefaultPreset(preset.id);
              onRefresh();
            }}
          />
          <Action title="New Preset" icon={Icon.Plus} shortcut={Keyboard.Shortcut.Common.New} onAction={onCreate} />
          <Action
            title="Capture Layout"
            icon={Icon.Camera}
            onAction={() => launchCommand({ name: "capture-layout", type: LaunchType.UserInitiated })}
          />
          <Action title="Duplicate" icon={Icon.Duplicate} onAction={duplicate} />
          <Action title="Delete Preset" icon={Icon.Trash} style={Action.Style.Destructive} onAction={remove} />
        </ActionPanel>
      }
      {...(mismatched ? { keywords: ["other desk"] } : {})}
    />
  );
}

export default function ManagePresetsCommand() {
  const { push } = useNavigation();
  const { data: state, isLoading, revalidate } = usePromise(loadState, []);
  const { data: screens } = usePromise(listScreens, []);
  const displayCount = screens?.length;

  async function apply(preset: Preset) {
    if (preset.slots.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: `${preset.name} has no windows` });
      return;
    }
    if (displayCount != null && preset.displayCount != null && preset.displayCount !== displayCount) {
      const ok = await confirmAlert({
        title: `${preset.name} is for ${preset.displayCount} displays`,
        message: `This desk has ${displayCount}. Apply anyway?`,
        primaryAction: { title: "Apply anyway" },
      });
      if (!ok) {
        return;
      }
    }
    try {
      await runPresetApply(preset);
    } catch (error) {
      await reportApplyError(error);
    }
  }

  async function createHere() {
    const preset = emptyPreset();
    await upsertPreset({ ...preset, displayCount });
    await revalidate();
    push(<SlotList presetId={preset.id} onChange={revalidate} />);
  }

  const presets = state?.presets ?? [];
  const thisDesk = displayCount == null ? presets : presets.filter((preset) => matchesDesk(preset, displayCount));
  const otherDesks = displayCount == null ? [] : presets.filter((preset) => !matchesDesk(preset, displayCount));

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search presets"
      actions={
        <ActionPanel>
          <Action title="New Preset" icon={Icon.Plus} shortcut={Keyboard.Shortcut.Common.New} onAction={createHere} />
          <Action
            title="Capture Layout"
            icon={Icon.Camera}
            onAction={() => launchCommand({ name: "capture-layout", type: LaunchType.UserInitiated })}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        icon={Icon.Desktop}
        title="No presets"
        description="Capture a layout or create one for this desk."
        actions={
          <ActionPanel>
            <Action
              title="Capture Layout"
              icon={Icon.Camera}
              onAction={() => launchCommand({ name: "capture-layout", type: LaunchType.UserInitiated })}
            />
            <Action title="New Preset" icon={Icon.Plus} onAction={createHere} />
          </ActionPanel>
        }
      />
      {displayCount != null && otherDesks.length > 0 ? (
        <>
          <List.Section title={`This desk (${displayCount} displays)`}>
            {thisDesk.map((preset) => (
              <PresetItem
                key={preset.id}
                preset={preset}
                displayCount={displayCount}
                onApply={apply}
                onRefresh={revalidate}
                onCreate={createHere}
              />
            ))}
          </List.Section>
          <List.Section title="Other desks">
            {otherDesks.map((preset) => (
              <PresetItem
                key={preset.id}
                preset={preset}
                displayCount={displayCount}
                onApply={apply}
                onRefresh={revalidate}
                onCreate={createHere}
              />
            ))}
          </List.Section>
        </>
      ) : (
        thisDesk.map((preset) => (
          <PresetItem
            key={preset.id}
            preset={preset}
            displayCount={displayCount}
            onApply={apply}
            onRefresh={revalidate}
            onCreate={createHere}
          />
        ))
      )}
    </List>
  );
}
