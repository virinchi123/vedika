import { parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";
import { FollowupType } from "../generated/prisma/enums.js";
import { createCrudValidators, ensureObject } from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import type {
  FollowupListCursor,
  FollowupPayload,
  ListFollowupsInput,
} from "./followup.service.js";

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

const parseFollowupType = (value: unknown, fieldName: string): FollowupType => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be one of BOOKING, SERVICE.`);
  }

  const normalizedValue = value.trim();

  if (!Object.values(FollowupType).includes(normalizedValue as FollowupType)) {
    throw new HttpError(400, `${fieldName} must be one of BOOKING, SERVICE.`);
  }

  return normalizedValue as FollowupType;
};

const parseFollowupPayload = (payload: Record<string, unknown>): FollowupPayload => {
  const type = parseFollowupType(payload.type, "type");
  const eventBookingId = parseOptionalString(payload.eventBookingId, {
    fieldName: "eventBookingId",
  });
  const serviceProviderId = parseOptionalString(payload.serviceProviderId, {
    fieldName: "serviceProviderId",
  });
  const customerInteractionId = parseOptionalString(payload.customerInteractionId, {
    fieldName: "customerInteractionId",
  });

  if (type === FollowupType.BOOKING) {
    if (eventBookingId === null) {
      throw new HttpError(400, "eventBookingId is required when type is BOOKING.");
    }

    if (serviceProviderId !== null) {
      throw new HttpError(400, "serviceProviderId is not allowed when type is BOOKING.");
    }
  }

  if (type === FollowupType.SERVICE) {
    if (serviceProviderId === null) {
      throw new HttpError(400, "serviceProviderId is required when type is SERVICE.");
    }

    if (eventBookingId !== null) {
      throw new HttpError(400, "eventBookingId is not allowed when type is SERVICE.");
    }
  }

  return {
    dueDate: parseRequiredDateTime(payload.dueDate, "dueDate"),
    type,
    description: parseOptionalString(payload.description, {
      fieldName: "description",
    }),
    eventBookingId,
    serviceProviderId,
    customerInteractionId,
  };
};

const parseFollowupListCursor = (value: string): FollowupListCursor => {
  return parseCreatedAtCursor(value);
};

const followupValidators = createCrudValidators<FollowupPayload, FollowupListCursor>({
  idFieldName: "followupId",
  parseCursor: parseFollowupListCursor,
  parseCreateBody: parseFollowupPayload,
});

export const parseListFollowupsInput = (value: unknown): ListFollowupsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parseFollowupListCursor,
  });

  const dueDate = query.dueDate === undefined
    ? null
    : parseRequiredDateTime(query.dueDate, "dueDate");
  const type = query.type === undefined
    ? null
    : parseFollowupType(query.type, "type");
  const eventBookingId = parseOptionalString(query.eventBookingId, {
    fieldName: "eventBookingId",
  });
  const serviceProviderId = parseOptionalString(query.serviceProviderId, {
    fieldName: "serviceProviderId",
  });

  return {
    ...pageParams,
    dueDate,
    type,
    eventBookingId,
    serviceProviderId,
  };
};

export const parseFollowupId = followupValidators.parseId;
export const parseCreateFollowupInput = followupValidators.parseCreateInput;
