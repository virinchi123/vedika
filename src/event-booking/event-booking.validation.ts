import { HttpError } from "../auth/http-error.js";
import { EventBookingMode } from "../generated/prisma/enums.js";
import {
  ensureObject,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import type { EventBookingPayload } from "./event-booking.service.js";

const parseRequiredDateTime = (value: unknown, fieldName: string): Date => {
  const stringValue = ensureRequiredString(value, fieldName);
  const date = new Date(stringValue);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 datetime string.`);
  }

  return date;
};

const parseOptionalDateTime = (value: unknown, fieldName: string): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 datetime string.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    return null;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 datetime string.`);
  }

  return date;
};

const parseOptionalString = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
};

const parseServiceProviderIds = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, "serviceProviderIds must be an array.");
  }

  return [...new Set(value.map((item, index) => ensureRequiredString(item, `serviceProviderIds[${index}]`)))];
};

const parseEventBookingMode = (value: unknown): EventBookingMode => {
  const mode = ensureRequiredString(value, "mode");

  if (!Object.values(EventBookingMode).includes(mode as EventBookingMode)) {
    throw new HttpError(400, "mode must be one of PHONE_IN, WALK_IN.");
  }

  return mode as EventBookingMode;
};

const parseEventBookingPayload = (value: unknown): EventBookingPayload => {
  const payload = ensureObject(value, "body");

  return {
    mode: parseEventBookingMode(payload.mode),
    bookingStatusId: ensureRequiredString(payload.bookingStatusId, "bookingStatusId"),
    eventStatusId: ensureRequiredString(payload.eventStatusId, "eventStatusId"),
    eventTypeId: ensureRequiredString(payload.eventTypeId, "eventTypeId"),
    bookingStart: parseRequiredDateTime(payload.bookingStart, "bookingStart"),
    bookingEnd: parseRequiredDateTime(payload.bookingEnd, "bookingEnd"),
    muhurat: parseOptionalDateTime(payload.muhurat, "muhurat"),
    customerName: ensureRequiredString(payload.customerName, "customerName"),
    phoneNumber1: ensureRequiredString(payload.phoneNumber1, "phoneNumber1"),
    phoneNumber2: parseOptionalString(payload.phoneNumber2, "phoneNumber2"),
    phoneNumber3: parseOptionalString(payload.phoneNumber3, "phoneNumber3"),
    referredBy: parseOptionalString(payload.referredBy, "referredBy"),
    serviceProviderIds: parseServiceProviderIds(payload.serviceProviderIds),
  };
};

export const parseEventBookingId = (value: unknown): string => {
  return ensureRequiredString(value, "eventBookingId");
};

export const parseCreateEventBookingInput = parseEventBookingPayload;
export const parseUpdateEventBookingInput = parseEventBookingPayload;
