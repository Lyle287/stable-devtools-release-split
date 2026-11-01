import assert from "node:assert/strict";
import test from "node:test";
import { assignVariant } from "./release_split.js";

test("the same developer stays in the same diagnostics variant", () => {
  const first = assignVariant("usr_founder_42", "compiler-diagnostics-v2");
  const second = assignVariant("usr_founder_42", "compiler-diagnostics-v2");

  assert.equal(first, "candidate");
  assert.equal(second, first);
});
