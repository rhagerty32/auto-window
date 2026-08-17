import { closeMainWindow, open, showHUD, showToast, Toast } from "@raycast/api";
import { applyPreset, applySummary } from "./apply";
import { debugLog, summarizeError } from "./debug";
import { AccessibilityError, HelperMissingError } from "./helper";
import type { Preset } from "./types";

const ACCESSIBILITY_PANE = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export async function reportApplyError(error: unknown): Promise<void> {
  debugLog("apply.error", summarizeError(error));
  if (error instanceof AccessibilityError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Accessibility permission needed",
      message: error.message,
      primaryAction: {
        title: "Open Settings",
        onAction: () => {
          void open(ACCESSIBILITY_PANE);
        },
      },
    });
    return;
  }
  if (error instanceof HelperMissingError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Helper not built",
      message: error.message,
    });
    return;
  }
  await showToast({
    style: Toast.Style.Failure,
    title: "Apply failed",
    message: error instanceof Error ? error.message : String(error),
  });
}

export async function runPresetApply(preset: Preset): Promise<void> {
  debugLog("apply.command", { name: preset.name, displayCount: preset.displayCount, slots: preset.slots.length });
  await closeMainWindow({ clearRootSearch: true });
  await showHUD("Arranging windows…");
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Arranging windows…",
    message: preset.name,
  });
  try {
    const result = await applyPreset(preset);
    const summary = applySummary(result);
    if (summary.failed) {
      toast.style = Toast.Style.Failure;
      toast.title = summary.title;
      toast.message = summary.message;
      return;
    }
    await toast.hide();
    await showHUD(summary.title);
    if (summary.message) {
      await showToast({
        style: Toast.Style.Success,
        title: summary.title,
        message: summary.message,
      });
    }
  } catch (error) {
    await toast.hide();
    throw error;
  }
}
