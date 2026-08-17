import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRegion, regionFormValue } from "./region";

describe("normalizeRegion", () => {
  it("keeps a named region", () => {
    assert.deepEqual(normalizeRegion({ kind: "named", name: "large" }), { kind: "named", name: "large" });
  });

  it("unwraps a nested named region object", () => {
    assert.deepEqual(normalizeRegion({ kind: "named", name: { kind: "named", name: "fill" } }), {
      kind: "named",
      name: "fill",
    });
  });

  it("dropdown value is always a member string", () => {
    assert.equal(regionFormValue({ kind: "named", name: "bottom-two-thirds" }), "bottom-two-thirds");
    assert.equal(regionFormValue({ kind: "named", name: { kind: "named", name: "fill" } }), "fill");
    assert.equal(regionFormValue({ kind: "percent", x: 0.1, y: 0.1, w: 0.5, h: 0.5 }), "custom");
    assert.equal(regionFormValue(undefined), "fill");
  });
});
