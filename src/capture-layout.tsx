import { Action, ActionPanel, Form, Icon, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { randomUUID } from "node:crypto";
import { useEffect, useRef, useState } from "react";
import { AccessibilityError, HelperMissingError, listScreens, listSpaces, listWindows } from "./lib/helper";
import { debugLog, summarizeError } from "./lib/debug";
import {
  buildCandidates,
  candidateToSlot,
  captureDisplays,
  captureGroups,
  findPresetToUpdate,
  isVolatileTitleBundle,
  regionLabel,
  spaceNotes,
  suggestedCaptureName,
  type CaptureCandidate,
} from "./lib/capture";
import { loadState, upsertPreset } from "./lib/presets";
import { deskLabel } from "./lib/spaces";
import type { Preset } from "./lib/types";

async function snapshotDesk() {
  debugLog("capture.start", {});
  const screens = await listScreens();
  const spaces = await listSpaces();
  const { windows } = await listWindows();
  const candidates = buildCandidates(windows, screens);
  const state = await loadState();
  debugLog("capture.snapshot", {
    displayCount: screens.length,
    windowCount: windows.length,
    candidateCount: candidates.length,
    spacesAvailable: spaces.available,
    separateSpaces: spaces.separateSpaces,
    spaceDisplays: spaces.displays.map((d) => ({
      screenId: d.screenId,
      activeIndex: d.activeIndex,
      spaces: d.spaces.length,
    })),
    windows: windows.slice(0, 40).map((w) => ({
      id: w.id,
      app: w.appName,
      bundleId: w.bundleId,
      title: w.title?.slice(0, 80),
      positionable: w.positionable,
      screenId: w.screenId,
      spaceIndex: w.spaceIndex,
      frame: w.frame,
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      app: c.appName,
      display: c.display,
      spaceIndex: c.spaceIndex,
      region: c.region,
      titleContains: c.titleContains,
      zIndex: c.zIndex,
      fullscreen: c.fullscreen,
    })),
  });
  return {
    screens,
    spaces,
    candidates,
    displayCount: screens.length,
    separateSpaces: spaces.separateSpaces,
    displays: captureDisplays(screens, spaces),
    presets: state.presets,
  };
}

function checkboxId(id: string): string {
  return `inc_${id.replace(/[^A-Za-z0-9]/g, "_")}`;
}

function candidateSubtitle(candidate: CaptureCandidate): string {
  const parts = [regionLabel(candidate.region, candidate.fullscreen)];
  if (candidate.titleContains) {
    parts.push(`title “${candidate.titleContains}”`);
  } else if (candidate.title && !isVolatileTitleBundle(candidate.bundleId)) {
    parts.push(candidate.title);
  }
  return parts.join(" · ");
}

export default function Command() {
  const { data, isLoading, error } = usePromise(snapshotDesk, [], {
    onError: (err) => {
      debugLog("capture.error", summarizeError(err));
    },
  });
  const [destination, setDestination] = useState("new");
  const [name, setName] = useState("");
  const didInit = useRef(false);

  useEffect(() => {
    if (!data || didInit.current) {
      return;
    }
    didInit.current = true;
    const suggested = suggestedCaptureName(data.displayCount);
    const match = findPresetToUpdate(data.presets, suggested, data.displayCount);
    if (match) {
      setDestination(match.id);
      setName(match.name);
    } else {
      setDestination("new");
      setName(suggested);
    }
  }, [data]);

  function selectDestination(id: string) {
    setDestination(id);
    if (!data) {
      return;
    }
    if (id === "new") {
      setName(suggestedCaptureName(data.displayCount));
      return;
    }
    const preset = data.presets.find((item) => item.id === id);
    if (preset) {
      setName(preset.name);
    }
  }

  async function save(values: { destination: string; name: string } & Record<string, unknown>) {
    if (!data) {
      return;
    }
    const selected = data.candidates.filter((candidate) => values[checkboxId(candidate.id)] !== false);
    if (selected.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Select at least one window" });
      return;
    }

    const dest = values.destination || destination;
    const label = (values.name || name || "").trim() || suggestedCaptureName(data.displayCount);
    const existing = dest !== "new" ? data.presets.find((preset) => preset.id === dest) : undefined;
    if (dest !== "new" && !existing) {
      await showToast({ style: Toast.Style.Failure, title: "That preset is gone" });
      return;
    }

    const hasDefault = data.presets.some((preset) => preset.isDefault && preset.displayCount === data.displayCount);
    const preset: Preset = {
      id: existing?.id ?? randomUUID(),
      name: label,
      isDefault: existing?.isDefault ?? !hasDefault,
      displayCount: data.displayCount,
      separateSpaces: data.separateSpaces,
      displays: data.displays,
      slots: selected.map(candidateToSlot),
      commandSlot: existing?.commandSlot,
    };

    await upsertPreset(preset);
    debugLog("capture.saved", {
      id: preset.id,
      name: preset.name,
      updated: Boolean(existing),
      displayCount: preset.displayCount,
      slotCount: preset.slots.length,
      slots: preset.slots.map((s) => ({
        app: s.appName,
        display: s.display,
        spaceIndex: s.spaceIndex,
        region: s.region,
        zIndex: s.zIndex,
        fullscreen: s.fullscreen,
      })),
    });
    await showToast({
      style: Toast.Style.Success,
      title: existing ? `Updated ${preset.name}` : `Saved ${preset.name}`,
      message: `${selected.length} window${selected.length === 1 ? "" : "s"} · ${data.displayCount} display${data.displayCount === 1 ? "" : "s"}`,
    });
  }

  const groups = data ? captureGroups(data.candidates, data.separateSpaces) : [];
  const notes = data ? spaceNotes(data.candidates) : [];
  const intro = data
    ? [
        `${data.displayCount} display${data.displayCount === 1 ? "" : "s"} · ${data.candidates.length} window${data.candidates.length === 1 ? "" : "s"}`,
        ...notes,
        "Uncheck to leave a window unmanaged.",
        data.spaces.available
          ? undefined
          : "Could not read Mission Control Spaces, so every window was tagged Space 1.",
      ]
        .filter(Boolean)
        .join(" ")
    : "Reading windows and Spaces…";

  return (
    <Form
      key={data ? "ready" : "loading"}
      isLoading={isLoading}
      navigationTitle="Capture Layout"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={destination === "new" ? "Save New Preset" : "Overwrite Preset"}
            icon={Icon.Check}
            onSubmit={save}
          />
        </ActionPanel>
      }
    >
      {error ? (
        <Form.Description
          text={
            error instanceof AccessibilityError
              ? error.message
              : error instanceof HelperMissingError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : String(error)
          }
        />
      ) : null}
      <Form.Description text={intro} />
      {groups.flatMap((group) => [
        <Form.Description
          key={`group:${group.label}`}
          title={group.label}
          text={`${group.items.length} window${group.items.length === 1 ? "" : "s"}`}
        />,
        ...group.items.map((candidate) => (
          <Form.Checkbox
            key={candidate.id}
            id={checkboxId(candidate.id)}
            title={candidate.appName}
            label={candidateSubtitle(candidate)}
            defaultValue
          />
        )),
      ])}
      <Form.Separator />
      <Form.Dropdown id="destination" title="Save to" value={destination} onChange={selectDestination}>
        <Form.Dropdown.Item value="new" title="New preset" />
        {(data?.presets ?? []).map((preset) => (
          <Form.Dropdown.Item key={preset.id} value={preset.id} title={`${preset.name} · ${deskLabel(preset)}`} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="name"
        title="Name"
        placeholder={data ? suggestedCaptureName(data.displayCount) : "Work"}
        value={name}
        onChange={setName}
      />
    </Form>
  );
}
