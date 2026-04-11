import {HttpError} from "./http-error.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type OptionalStringParserOptions = {
  fieldName: string;
  maxLength?: number;
  trim?: boolean;
};

const ensureString = (value: unknown, fieldName: string, trim = true): string => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalizedValue = trim ? value.trim() : value;

  if (!normalizedValue) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return normalizedValue;
};

export const normalizeEmailAddress = (emailAddress: string): string => {
  return emailAddress.trim().toLowerCase();
};

export const parseEmailAddress = (value: unknown): string => {
  const emailAddress = normalizeEmailAddress(ensureString(value, "emailAddress"));

  if (!emailPattern.test(emailAddress)) {
    throw new HttpError(400, "emailAddress must be a valid email address.");
  }

  return emailAddress;
};

export const parsePassword = (value: unknown): string => {
  const password = ensureString(value, "password", false);

  if (password.length < 8) {
    throw new HttpError(400, "password must be at least 8 characters long.");
  }

  return password;
};

export const parseRefreshToken = (value: unknown): string => {
  return ensureString(value, "refreshToken");
};

export const parseOptionalString = (
  value: unknown,
  { fieldName, maxLength, trim = true }: OptionalStringParserOptions,
): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalizedValue = trim ? value.trim() : value;

  if (!normalizedValue) {
    return null;
  }

  if (typeof maxLength === "number") {
    return normalizedValue.slice(0, maxLength);
  }

  return normalizedValue;
};
