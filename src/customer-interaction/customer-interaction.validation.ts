import { parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";
import { CustomerInteractionType } from "../generated/prisma/enums.js";
import { createCrudValidators, ensureObject } from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import type {
  CustomerInteractionIgnoreInput,
  CustomerInteractionListCursor,
  CustomerInteractionPayload,
  ListCustomerInteractionsInput,
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

const parseCustomerInteractionPayload = (
  payload: Record<string, unknown>,
): CustomerInteractionPayload => {
  return {
    interactionType: parseInteractionType(payload.interactionType),
    occurredAt: parseRequiredDateTime(payload.occurredAt, "occurredAt"),
    eventBookingIds: parseEventBookingIds(payload.eventBookingIds),
  };
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

const customerInteractionValidators = createCrudValidators<
  CustomerInteractionPayload,
  CustomerInteractionListCursor
>({
  idFieldName: "customerInteractionId",
  parseCursor: parseCustomerInteractionListCursor,
  parseCreateBody: parseCustomerInteractionPayload,
});

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

export const parseCustomerInteractionId = customerInteractionValidators.parseId;
export const parseCreateCustomerInteractionInput =
  customerInteractionValidators.parseCreateInput;
export const parseUpdateCustomerInteractionInput =
  customerInteractionValidators.parseUpdateInput;
export const parseIgnoreCustomerInteractionInput = (
  value: unknown,
): CustomerInteractionIgnoreInput => {
  const payload = ensureObject(value, "body");

  return {
    ignored: parseRequiredBoolean(payload.ignored, "ignored"),
  };
};
