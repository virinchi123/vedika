import { HttpError } from "../auth/http-error.js";
import {
  ensureObject,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import { decodeCursor, parseCursorPageParams } from "../lib/listing.js";
import type {
  CalendarEventCursor,
  CalendarEventType,
  ListCalendarEventsInput,
} from "./calendar-event.service.js";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parseCalendarEventType = (
  value: unknown,
  fieldName: string,
): CalendarEventType => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be one of event_booking, followup.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue !== "event_booking" && normalizedValue !== "followup") {
    throw new HttpError(400, `${fieldName} must be one of event_booking, followup.`);
  }

  return normalizedValue;
};

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

const parseCalendarEventCursor = (value: string): CalendarEventCursor => {
  const decodedCursor = decodeCursor<Record<string, unknown>>(value, "cursor");
  const objectId = ensureRequiredString(decodedCursor.objectId, "cursor.objectId");

  if (typeof decodedCursor.date !== "string") {
    throw new HttpError(400, "cursor must be a valid cursor.");
  }

  const date = new Date(decodedCursor.date);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "cursor must be a valid cursor.");
  }

  return {
    date,
    type: parseCalendarEventType(decodedCursor.type, "cursor.type"),
    objectId,
  };
};

export const parseListCalendarEventsInput = (
  value: unknown,
): ListCalendarEventsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parseCalendarEventCursor,
  });
  const fromDateValue = parseRequiredDateOnly(query.fromDate, "fromDate");
  const toDateValue = parseRequiredDateOnly(query.toDate, "toDate");

  if (fromDateValue.getTime() > toDateValue.getTime()) {
    throw new HttpError(400, "fromDate must be less than or equal to toDate.");
  }

  return {
    ...pageParams,
    fromDate: startOfUtcDay(fromDateValue),
    toDate: endOfUtcDay(toDateValue),
  };
};
