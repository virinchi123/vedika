import { Prisma } from "../generated/prisma/client.js";
import { PaymentMode } from "../generated/prisma/enums.js";
import { HttpError } from "../auth/http-error.js";
import {
  ensureObject,
  ensureRequiredString,
} from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import { parseOptionalString } from "../auth/auth.validation.js";
import type {
  ListPaymentsInput,
  PaymentListCursor,
  PaymentPayload,
} from "./payment.service.js";

const decimalPattern = /^\d+(?:\.\d{1,2})?$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parsePaymentMode = (value: unknown): PaymentMode => {
  const normalizedValue = ensureRequiredString(value, "mode");

  if (!Object.values(PaymentMode).includes(normalizedValue as PaymentMode)) {
    throw new HttpError(400, "mode must be one of CASH, BANK_TRANSFER, UPI.");
  }

  return normalizedValue as PaymentMode;
};

const parseAmount = (value: unknown): Prisma.Decimal => {
  const stringValue = ensureRequiredString(value, "amount");

  if (!decimalPattern.test(stringValue)) {
    throw new HttpError(400, "amount must be a decimal string with up to 2 decimal places.");
  }

  const amount = new Prisma.Decimal(stringValue);

  if (amount.lessThanOrEqualTo(0)) {
    throw new HttpError(400, "amount must be greater than 0.");
  }

  return amount;
};

const parseDateOnly = (value: unknown, fieldName: string): Date => {
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

const parsePaymentPayload = (value: unknown): PaymentPayload => {
  const payload = ensureObject(value, "body");

  return {
    mode: parsePaymentMode(payload.mode),
    amount: parseAmount(payload.amount),
    date: parseDateOnly(payload.date, "date"),
    serviceId: ensureRequiredString(payload.serviceId, "serviceId"),
    paymentProofFileId: parseOptionalString(payload.paymentProofFileId, {
      fieldName: "paymentProofFileId",
    }),
  };
};

const parsePaymentListCursor = (value: string): PaymentListCursor => {
  return parseCreatedAtCursor(value);
};

export const parsePaymentId = (value: unknown): string => {
  return ensureRequiredString(value, "paymentId");
};

export const parseCreatePaymentInput = parsePaymentPayload;
export const parseUpdatePaymentInput = parsePaymentPayload;

export const parseListPaymentsInput = (value: unknown): ListPaymentsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parsePaymentListCursor,
  });

  return {
    ...pageParams,
    serviceId: parseOptionalString(query.serviceId, {
      fieldName: "serviceId",
    }),
  };
};
