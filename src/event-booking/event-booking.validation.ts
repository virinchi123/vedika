import { HttpError } from "../auth/http-error.js";
import { EventBookingMode } from "../generated/prisma/enums.js";
import {
  ensureObject,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import type {
  EventBookingListCursor,
  EventBookingPayload,
  ListEventBookingsInput,
} from "./event-booking.service.js";

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

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parseRequiredDateOnly = (value: unknown, fieldName: string): Date => {
  const stringValue = ensureRequiredString(value, fieldName);

  if (!dateOnlyPattern.test(stringValue)) {
    throw new HttpError(400, `${fieldName} must be a valid date in YYYY-MM-DD format.`);
  }

  const [yearString, monthString, dayString] = stringValue.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new HttpError(400, `${fieldName} must be a valid date in YYYY-MM-DD format.`);
  }

  return date;
};

const parseEventBookingListCursor = (value: string): EventBookingListCursor => {
  return parseCreatedAtCursor(value);
};

const startOfUtcDay = (value: Date): Date => {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
};

const endOfUtcDay = (value: Date): Date => {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
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

const parseRequiredServiceProviderIds = (value: unknown): string[] => {
  if (value === undefined) {
    throw new HttpError(400, "serviceProviderIds is required.");
  }

  return parseServiceProviderIds(value);
};

const parseEventBookingPayload = (
  value: unknown,
  options?: {
    requireServiceProviderIds?: boolean;
  },
): EventBookingPayload => {
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
    serviceProviderIds: options?.requireServiceProviderIds
      ? parseRequiredServiceProviderIds(payload.serviceProviderIds)
      : parseServiceProviderIds(payload.serviceProviderIds),
  };
};

export const parseEventBookingId = (value: unknown): string => {
  return ensureRequiredString(value, "eventBookingId");
};

export const parseListEventBookingsInput = (value: unknown): ListEventBookingsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parseEventBookingListCursor,
  });

  const fromDateValue = query.fromDate === undefined
    ? null
    : parseRequiredDateOnly(query.fromDate, "fromDate");
  const toDateValue = query.toDate === undefined
    ? null
    : parseRequiredDateOnly(query.toDate, "toDate");

  if (
    fromDateValue !== null &&
    toDateValue !== null &&
    fromDateValue.getTime() > toDateValue.getTime()
  ) {
    throw new HttpError(400, "fromDate must be less than or equal to toDate.");
  }

  return {
    ...pageParams,
    name: parseOptionalString(query.name, "name"),
    fromDate: fromDateValue === null ? null : startOfUtcDay(fromDateValue),
    toDate: toDateValue === null ? null : endOfUtcDay(toDateValue),
    phoneNumber: parseOptionalString(query.phoneNumber, "phoneNumber"),
  };
};

export const parseCreateEventBookingInput = parseEventBookingPayload;
export const parseUpdateEventBookingInput = (value: unknown): EventBookingPayload => {
  return parseEventBookingPayload(value, {
    requireServiceProviderIds: true,
  });
};
