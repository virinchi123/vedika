import { parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";
import { CustomerInteractionType } from "../generated/prisma/enums.js";
import {
  ensureObject,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import type {
  CreateCustomerInteractionInput,
  CustomerInteractionEventBookingAssociationInput,
  CustomerInteractionIgnoreInput,
  CustomerInteractionListCursor,
  ListCustomerInteractionsInput,
  UpdateCustomerInteractionInput,
  VoiceNoteInput,
} from "./customer-interaction.service.js";

const parseRequiredDateTime = (value: unknown, fieldName: string): Date => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 datetime string.`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 datetime string.`);
  }

  return date;
};

const parseInteractionType = (value: unknown): CustomerInteractionType => {
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "interactionType must be one of WALK_IN, PHONE_IN, MISSED_CALL.",
    );
  }

  const normalizedValue = value.trim();

  if (
    !Object.values(CustomerInteractionType).includes(
      normalizedValue as CustomerInteractionType,
    )
  ) {
    throw new HttpError(
      400,
      "interactionType must be one of WALK_IN, PHONE_IN, MISSED_CALL.",
    );
  }

  return normalizedValue as CustomerInteractionType;
};

const parseEventBookingIds = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, "eventBookingIds must be an array.");
  }

  return [
    ...new Set(
      value.map((item, index) => {
        const eventBookingId = parseOptionalString(item, {
          fieldName: `eventBookingIds[${index}]`,
        });

        if (eventBookingId === null) {
          throw new HttpError(400, `eventBookingIds[${index}] is required.`);
        }

        return eventBookingId;
      }),
    ),
  ];
};

const parseRequiredEventBookingIds = (value: unknown): string[] => {
  if (value === undefined) {
    throw new HttpError(400, "eventBookingIds must be an array.");
  }

  return parseEventBookingIds(value);
};

const parseVoiceNoteInput = (value: unknown): VoiceNoteInput => {
  const payload = ensureObject(value, "voiceNote");

  return {
    gcsPath: ensureRequiredString(payload.gcsPath, "voiceNote.gcsPath"),
    extension: ensureRequiredString(payload.extension, "voiceNote.extension"),
    originalName: parseOptionalString(payload.originalName, {
      fieldName: "voiceNote.originalName",
    }),
  };
};

const parseCreateVoiceNoteInput = (value: unknown): VoiceNoteInput | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return parseVoiceNoteInput(value);
};

const parseUpdateVoiceNoteInput = (
  value: unknown,
): VoiceNoteInput | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return parseVoiceNoteInput(value);
};

const parseOptionalBoolean = (value: unknown, fieldName: string): boolean => {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  return value;
};

const ensureVoiceNoteAllowed = (
  interactionType: CustomerInteractionType,
  voiceNote: VoiceNoteInput | null | undefined,
): void => {
  if (voiceNote !== undefined && voiceNote !== null && interactionType !== "WALK_IN") {
    throw new HttpError(
      400,
      "voiceNote is only allowed for WALK_IN customer interactions.",
    );
  }
};

const parseCreateCustomerInteractionPayload = (
  payload: Record<string, unknown>,
): CreateCustomerInteractionInput => {
  if ("clearVoiceNote" in payload) {
    throw new HttpError(
      400,
      "clearVoiceNote is only allowed when updating a customer interaction.",
    );
  }

  const interactionType = parseInteractionType(payload.interactionType);
  const voiceNote = parseCreateVoiceNoteInput(payload.voiceNote);

  ensureVoiceNoteAllowed(interactionType, voiceNote);

  return {
    interactionType,
    occurredAt: parseRequiredDateTime(payload.occurredAt, "occurredAt"),
    eventBookingIds: parseEventBookingIds(payload.eventBookingIds),
    voiceNote,
  };
};

const parseUpdateCustomerInteractionPayload = (
  payload: Record<string, unknown>,
): UpdateCustomerInteractionInput => {
  const interactionType = parseInteractionType(payload.interactionType);
  const voiceNote = parseUpdateVoiceNoteInput(payload.voiceNote);
  const clearVoiceNote = parseOptionalBoolean(
    payload.clearVoiceNote,
    "clearVoiceNote",
  );

  if (clearVoiceNote && voiceNote !== undefined && voiceNote !== null) {
    throw new HttpError(
      400,
      "clearVoiceNote cannot be true when voiceNote is provided.",
    );
  }

  ensureVoiceNoteAllowed(interactionType, voiceNote);

  return {
    interactionType,
    occurredAt: parseRequiredDateTime(payload.occurredAt, "occurredAt"),
    eventBookingIds: parseEventBookingIds(payload.eventBookingIds),
    voiceNote,
    clearVoiceNote,
  };
};

const parseCustomerInteractionListCursor = (
  value: string,
): CustomerInteractionListCursor => {
  return parseCreatedAtCursor(value);
};

const parseOptionalBooleanQueryParam = (
  value: unknown,
  fieldName: string,
): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false" || normalizedValue === "") {
    return false;
  }

  throw new HttpError(400, `${fieldName} must be a boolean.`);
};

const parseNullableBooleanQueryParam = (
  value: unknown,
  fieldName: string,
): boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new HttpError(400, `${fieldName} must be a boolean.`);
};

const parseRequiredBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  return value;
};

export const parseListCustomerInteractionsInput = (
  value: unknown,
): ListCustomerInteractionsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parseCustomerInteractionListCursor,
  });

  const eventBookingId = parseOptionalString(query.eventBookingId, {
    fieldName: "eventBookingId",
  });
  const ignored = parseNullableBooleanQueryParam(query.ignored, "ignored");
  const unlinkedOnly = parseOptionalBooleanQueryParam(
    query.unlinkedOnly,
    "unlinkedOnly",
  );

  if (eventBookingId !== null && unlinkedOnly) {
    throw new HttpError(
      400,
      "eventBookingId and unlinkedOnly cannot be used together.",
    );
  }

  return {
    ...pageParams,
    eventBookingId,
    ignored,
    unlinkedOnly,
  };
};

export const parseCustomerInteractionId = (value: unknown): string => {
  return ensureRequiredString(value, "customerInteractionId");
};

export const parseCreateCustomerInteractionInput = (
  value: unknown,
): CreateCustomerInteractionInput => {
  return parseCreateCustomerInteractionPayload(ensureObject(value, "body"));
};

export const parseUpdateCustomerInteractionInput = (
  value: unknown,
): UpdateCustomerInteractionInput => {
  return parseUpdateCustomerInteractionPayload(ensureObject(value, "body"));
};

export const parseIgnoreCustomerInteractionInput = (
  value: unknown,
): CustomerInteractionIgnoreInput => {
  const payload = ensureObject(value, "body");

  return {
    ignored: parseRequiredBoolean(payload.ignored, "ignored"),
  };
};

export const parseAssociateCustomerInteractionEventBookingsInput = (
  value: unknown,
): CustomerInteractionEventBookingAssociationInput => {
  const payload = ensureObject(value, "body");

  return {
    eventBookingIds: parseRequiredEventBookingIds(payload.eventBookingIds),
  };
};
