import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../auth/http-error.js";
import { ensureObject, ensureRequiredString } from "../lib/crud-validation.js";
import type { ServiceUpdatePayload } from "./service.service.js";

const editableFields = ["contractedAmount", "commissionAmount"] as const;
const editableFieldSet = new Set<string>(editableFields);

const decimalPattern = /^\d+(?:\.\d{1,2})?$/;

const parseOptionalDecimalField = (
  value: unknown,
  fieldName: string,
): Prisma.Decimal | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(
      400,
      `${fieldName} must be a decimal string with up to 2 decimal places or null.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new HttpError(400, `${fieldName} must be a decimal string with up to 2 decimal places or null.`);
  }

  if (!decimalPattern.test(normalizedValue)) {
    throw new HttpError(400, `${fieldName} must be a decimal string with up to 2 decimal places or null.`);
  }

  return new Prisma.Decimal(normalizedValue);
};

export const parseServiceId = (value: unknown): string => {
  return ensureRequiredString(value, "serviceId");
};

export const parseUpdateServiceInput = (value: unknown): ServiceUpdatePayload => {
  const payload = ensureObject(value, "body");
  const extraFields = Object.keys(payload).filter((field) => !editableFieldSet.has(field));

  if (extraFields.length > 0) {
    throw new HttpError(
      400,
      `Only contractedAmount and commissionAmount can be updated.`,
    );
  }

  const contractedAmount = parseOptionalDecimalField(
    payload.contractedAmount,
    "contractedAmount",
  );
  const commissionAmount = parseOptionalDecimalField(
    payload.commissionAmount,
    "commissionAmount",
  );

  if (contractedAmount === undefined && commissionAmount === undefined) {
    throw new HttpError(
      400,
      "At least one of contractedAmount or commissionAmount must be provided.",
    );
  }

  return {
    contractedAmount,
    commissionAmount,
  };
};
