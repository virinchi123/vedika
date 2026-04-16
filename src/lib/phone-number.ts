import { HttpError } from "../auth/http-error.js";

const canonicalIndianPhonePattern = /^\d{10}$/;

export const normalizeIndianPhoneNumber = (value: string, fieldName: string): string => {
  const digitsOnly = value.replace(/\D/g, "");
  const withoutLeadingZeros = digitsOnly.replace(/^0+/, "");
  const canonicalValue =
    withoutLeadingZeros.length === 12 && withoutLeadingZeros.startsWith("91")
      ? withoutLeadingZeros.slice(2)
      : withoutLeadingZeros;

  if (!canonicalIndianPhonePattern.test(canonicalValue)) {
    throw new HttpError(400, `${fieldName} must be a valid Indian phone number.`);
  }

  return canonicalValue;
};
