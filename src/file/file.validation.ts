import { parseOptionalString } from "../auth/auth.validation.js";
import { ensureObject, ensureRequiredString } from "../lib/crud-validation.js";
import type { CreateFileInput } from "./file.service.js";

export const parseCreateFileInput = (value: unknown): CreateFileInput => {
  const payload = ensureObject(value, "body");

  return {
    gcsPath: ensureRequiredString(payload.gcsPath, "gcsPath"),
    extension: ensureRequiredString(payload.extension, "extension"),
    originalName: parseOptionalString(payload.originalName, {
      fieldName: "originalName",
    }),
    eventBookingId: ensureRequiredString(payload.eventBookingId, "eventBookingId"),
  };
};
