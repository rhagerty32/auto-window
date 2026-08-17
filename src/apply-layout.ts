import { showHUD, type LaunchProps } from "@raycast/api";
import { loadState } from "./lib/presets";
import { reportApplyError, runPresetApply } from "./lib/run";
import { findPresetByName } from "./lib/slots";

export default async function Command(props: LaunchProps<{ arguments: { name?: string } }>) {
  const name = props.arguments.name?.trim() ?? "";
  if (!name) {
    await showHUD("Type a preset name");
    return;
  }
  const { presets } = await loadState();
  const preset = findPresetByName(presets, name);
  if (!preset) {
    await showHUD(`No preset named “${name}”`);
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
