import { environment, showHUD, updateCommandMetadata, type LaunchProps } from "@raycast/api";
import { loadState } from "./presets";
import { reportApplyError, runPresetApply } from "./run";
import { getPresetBySlot, layoutSlotFromCommandName } from "./slots";

export default async function runLayoutSlotCommand(
  props: LaunchProps<{ launchContext?: { metadataOnly?: boolean } }>,
): Promise<void> {
  const slot = layoutSlotFromCommandName(environment.commandName);
  const { presets } = await loadState();
  const preset = slot != null ? getPresetBySlot(presets, slot) : undefined;
  await updateCommandMetadata({ subtitle: preset?.name ?? "No preset assigned" });
  if (props.launchContext?.metadataOnly) {
    return;
  }
  if (slot == null) {
    await showHUD("Unknown layout slot");
    return;
  }
  if (!preset) {
    await showHUD(`No preset in Layout ${slot}. Assign one in Manage Presets.`);
    return;
  }
  if (preset.slots.length === 0) {
    await showHUD(`${preset.name} has no windows`);
    return;
  }
  try {
    await runPresetApply(preset);
  } catch (error) {
    await reportApplyError(error);
  }
}
