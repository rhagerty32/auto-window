import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareSlotZIndex, shouldRestackWindow, slotZIndex } from "./zorder";
import type { WindowSlot } from "./types";

function slot(partial: Partial<WindowSlot> & Pick<WindowSlot, "id">): WindowSlot {
  return {
    bundleId: "app",
    appName: "App",
    titleContains: "",
    display: "main",
    region: { kind: "named", name: "left-half" },
    launchIfNeeded: true,
    spaceIndex: 1,
    ...partial,
  };
}

describe("slotZIndex", () => {
  it("uses the captured value when present", () => {
    assert.equal(slotZIndex(slot({ id: "a", zIndex: 12 })), 12);
  });

  it("ranks fill above a side window when zIndex is missing", () => {
    const messages = slot({ id: "messages", region: { kind: "named", name: "left-half" } });
    const dia = slot({ id: "dia", region: { kind: "named", name: "fill" } });
    assert.ok(slotZIndex(dia) > slotZIndex(messages));
    assert.ok(compareSlotZIndex(messages, dia) < 0);
  });

  it("ranks native fullscreen above fill for legacy presets", () => {
    const fill = slot({ id: "fill", region: { kind: "named", name: "fill" } });
    const full = slot({ id: "full", region: { kind: "named", name: "fill" }, fullscreen: true });
    assert.ok(slotZIndex(full) > slotZIndex(fill));
  });
});

describe("shouldRestackWindow", () => {
  it("always restacks windowed slots", () => {
    assert.equal(
      shouldRestackWindow({ fullscreenSlot: false, liveFullScreen: false, displayActiveFullscreen: false }),
      true,
    );
  });

  it("restacks a failed fullscreen that is still a window", () => {
    assert.equal(
      shouldRestackWindow({ fullscreenSlot: true, liveFullScreen: false, displayActiveFullscreen: false }),
      true,
    );
  });

  it("does not raise a native-fullscreen window when capture was on the desktop", () => {
    assert.equal(
      shouldRestackWindow({ fullscreenSlot: true, liveFullScreen: true, displayActiveFullscreen: false }),
      false,
    );
  });

  it("raises fullscreen when capture was looking at that desktop", () => {
    assert.equal(
      shouldRestackWindow({ fullscreenSlot: true, liveFullScreen: true, displayActiveFullscreen: true }),
      true,
    );
  });
});
