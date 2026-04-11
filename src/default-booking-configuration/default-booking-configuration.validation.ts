import { HttpError } from "../auth/http-error.js";
import {
  createCrudValidators,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import { parseCreatedAtCursor } from "../lib/listing.js";
import type {
  DefaultBookingConfigurationListCursor,
  DefaultBookingConfigurationPayload,
  ListDefaultBookingConfigurationsInput,
} from "./default-booking-configuration.service.js";

const timeOfDayPattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const parseDefaultStartTime = (value: unknown): Date => {
  const defaultStartTime = ensureRequiredString(value, "defaultStartTime");
  const timeMatch = defaultStartTime.match(timeOfDayPattern);

  if (timeMatch === null) {
    throw new HttpError(
      400,
      "defaultStartTime must be a valid time of day in HH:mm or HH:mm:ss format.",
    );
  }

  const [, hours, minutes, seconds = "00"] = timeMatch;

  return new Date(
    Date.UTC(
      1970,
      0,
      1,
      Number(hours),
      Number(minutes),
      Number(seconds),
      0,
    ),
  );
};

const parseDefaultDurationInMinutes = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new HttpError(
      400,
      "defaultDurationInMinutes must be a positive integer.",
    );
  }

  return value;
};

const parseDefaultBookingConfigurationPayload = (
  payload: Record<string, unknown>,
): DefaultBookingConfigurationPayload => {
  return {
    eventTypeId: ensureRequiredString(payload.eventTypeId, "eventTypeId"),
    defaultStartTime: parseDefaultStartTime(payload.defaultStartTime),
    defaultDurationInMinutes: parseDefaultDurationInMinutes(
      payload.defaultDurationInMinutes,
    ),
  };
};

const parseDefaultBookingConfigurationListCursor = (
  value: string,
): DefaultBookingConfigurationListCursor => {
  return parseCreatedAtCursor(value);
};

const defaultBookingConfigurationValidators = createCrudValidators<
  DefaultBookingConfigurationPayload,
  DefaultBookingConfigurationListCursor
>({
  idFieldName: "defaultBookingConfigurationId",
  parseCursor: parseDefaultBookingConfigurationListCursor,
  parseCreateBody: parseDefaultBookingConfigurationPayload,
});

export const parseDefaultBookingConfigurationId =
  defaultBookingConfigurationValidators.parseId;
export const parseListDefaultBookingConfigurationsInput: (
  value: unknown,
) => ListDefaultBookingConfigurationsInput =
  defaultBookingConfigurationValidators.parseListInput;
export const parseUpdateDefaultBookingConfigurationInput =
  defaultBookingConfigurationValidators.parseUpdateInput;
