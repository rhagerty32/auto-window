import { showHUD, showToast, Toast } from "@raycast/api";
import { debugLog } from "./lib/debug";
import { listScreens } from "./lib/helper";
import { reportApplyError, runPresetApply } from "./lib/run";
import { getDefaultPreset } from "./lib/presets";

export default async function Command() {
  try {
    const screens = await listScreens();
    const displayCount = screens.length;
    const preset = await getDefaultPreset(displayCount);
    debugLog("apply-default", {
      displayCount,
      preset: preset
        ? { id: preset.id, name: preset.name, displayCount: preset.displayCount, slots: preset.slots.length }
        : null,
    });
    if (!preset) {
      await showHUD(`No layout for ${displayCount} display${displayCount === 1 ? "" : "s"}`);
      return;
    }
    if (preset.slots.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: `${preset.name} has no windows`,
      });
      return;
    }
    await runPresetApply(preset);
  } catch (error) {
    await reportApplyError(error);
  }
}
