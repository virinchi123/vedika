import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpError } from "../src/auth/http-error.js";
import { parseOptionalString } from "../src/auth/auth.validation.js";

describe("parseOptionalString", () => {
  it("returns null for missing values and blank strings", () => {
    assert.equal(parseOptionalString(undefined, { fieldName: "nickname" }), null);
    assert.equal(parseOptionalString(null, { fieldName: "nickname" }), null);
    assert.equal(parseOptionalString("   ", { fieldName: "nickname" }), null);
  });

  it("trims values by default", () => {
    assert.equal(parseOptionalString("  Pixel 9  ", { fieldName: "deviceName" }), "Pixel 9");
  });

  it("can preserve whitespace when trim is disabled", () => {
    assert.equal(parseOptionalString("  padded  ", { fieldName: "notes", trim: false }), "  padded  ");
  });

  it("enforces string input", () => {
    assert.throws(() => parseOptionalString(42, { fieldName: "nickname" }), (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, "nickname must be a string.");
      return true;
    });
  });

  it("supports field-specific limits", () => {
    assert.equal(parseOptionalString("abcdef", { fieldName: "nickname", maxLength: 4 }), "abcd");
  });

  it("supports device-name style caps without a field-specific wrapper", () => {
    const longDeviceName = "x".repeat(150);

    assert.equal(parseOptionalString(longDeviceName, { fieldName: "deviceName", maxLength: 120 }), "x".repeat(120));
  });
});
