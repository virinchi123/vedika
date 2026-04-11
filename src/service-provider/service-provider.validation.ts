import { normalizeEmailAddress, parseOptionalString } from "../auth/auth.validation.js";
import { HttpError } from "../auth/http-error.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ensureObject = (value: unknown, fieldName: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
};

const ensureString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return normalizedValue;
};

export const parseServiceProviderId = (value: unknown): string => {
  return ensureString(value, "serviceProviderId");
};

export const parseCreateServiceProviderInput = (value: unknown) => {
  const payload = ensureObject(value, "body");

  return {
    name: ensureString(payload.name, "name"),
    phoneNumber: parseOptionalString(payload.phoneNumber, {
      fieldName: "phoneNumber",
      maxLength: 40,
    }),
    email: parseOptionalEmail(payload.email),
  };
};

export const parseUpdateServiceProviderInput = (value: unknown) => {
  const payload = ensureObject(value, "body");

  return {
    name: ensureString(payload.name, "name"),
    phoneNumber: parseOptionalString(payload.phoneNumber, {
      fieldName: "phoneNumber",
      maxLength: 40,
    }),
    email: parseOptionalEmail(payload.email),
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
