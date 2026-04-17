import { normalizeEmailAddress, parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";
import { createCrudValidators, ensureRequiredString } from "../lib/crud-validation.js";
import { parseCreatedAtCursor } from "../lib/listing.js";
import type {
  ListServiceProvidersInput,
  ServiceProviderListCursor,
  ServiceProviderPayload,
} from "./service-provider.service.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseRequiredCommissionRate = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new HttpError(400, "commissionRate must be a number.");
  }

  if (value < 0 || value > 100) {
    throw new HttpError(400, "commissionRate must be between 0 and 100.");
  }

  return value;
};

const parseServiceProviderPayload = (payload: Record<string, unknown>) => {
  return {
    name: ensureRequiredString(payload.name, "name"),
    phoneNumber: parseOptionalString(payload.phoneNumber, {
      fieldName: "phoneNumber",
      maxLength: 40,
    }),
    email: parseOptionalEmail(payload.email),
    commissionRate: parseRequiredCommissionRate(payload.commissionRate),
  };
};

const parseOptionalEmail = (value: unknown): string | null => {
  const email = parseOptionalString(value, {
    fieldName: "email",
    maxLength: 320,
  });

  if (email === null) {
    return null;
  }

  const normalizedEmail = normalizeEmailAddress(email);

  if (!emailPattern.test(normalizedEmail)) {
    throw new HttpError(400, "email must be a valid email address.");
  }

  return normalizedEmail;
};

const parseServiceProviderListCursor = (value: string): ServiceProviderListCursor => {
  return parseCreatedAtCursor(value);
};

const serviceProviderValidators = createCrudValidators<ServiceProviderPayload, ServiceProviderListCursor>({
  idFieldName: "serviceProviderId",
  parseCursor: parseServiceProviderListCursor,
  parseCreateBody: parseServiceProviderPayload,
});

export const parseServiceProviderId = serviceProviderValidators.parseId;
export const parseListServiceProvidersInput: (value: unknown) => ListServiceProvidersInput =
  serviceProviderValidators.parseListInput;
export const parseCreateServiceProviderInput = serviceProviderValidators.parseCreateInput;
export const parseUpdateServiceProviderInput = serviceProviderValidators.parseUpdateInput;
