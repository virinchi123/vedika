import { parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";
import { CustomerInteractionType } from "../generated/prisma/enums.js";
import { createCrudValidators } from "../lib/crud-validation.js";
import type { CustomerInteractionPayload } from "./customer-interaction.service.js";

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
    eventBookingId: parseOptionalString(payload.eventBookingId, {
      fieldName: "eventBookingId",
    }),
  };
};

const customerInteractionValidators = createCrudValidators<CustomerInteractionPayload, string>({
  idFieldName: "customerInteractionId",
  parseCursor: (value) => value,
  parseCreateBody: parseCustomerInteractionPayload,
});

export const parseCustomerInteractionId = customerInteractionValidators.parseId;
export const parseCreateCustomerInteractionInput =
  customerInteractionValidators.parseCreateInput;
export const parseUpdateCustomerInteractionInput =
  customerInteractionValidators.parseUpdateInput;
