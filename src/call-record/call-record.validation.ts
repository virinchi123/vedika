import { parseOptionalString } from "../auth/auth.validation.js";
import { ensureRequiredString, ensureObject } from "../lib/crud-validation.js";
import { parseCreatedAtCursor, parseCursorPageParams } from "../lib/listing.js";
import { normalizeIndianPhoneNumber } from "../lib/phone-number.js";
import type {
  CallRecordListCursor,
  CallRecordPayload,
  ListCallRecordsInput,
} from "./call-record.service.js";

const parseRequiredPhoneNumber = (value: unknown, fieldName: string): string => {
  return normalizeIndianPhoneNumber(ensureRequiredString(value, fieldName), fieldName);
};

const parseOptionalPhoneNumber = (value: unknown, fieldName: string): string | null => {
  const normalizedValue = parseOptionalString(value, {
    fieldName,
  });

  return normalizedValue === null ? null : normalizeIndianPhoneNumber(normalizedValue, fieldName);
};

const parseCallRecordPayload = (value: unknown): CallRecordPayload => {
  const payload = ensureObject(value, "body");

  return {
    callerNumber: parseRequiredPhoneNumber(payload.callerNumber, "callerNumber"),
    receiverNumber: parseRequiredPhoneNumber(payload.receiverNumber, "receiverNumber"),
    fileId: parseOptionalString(payload.fileId, {
      fieldName: "fileId",
    }),
  };
};

const parseCallRecordListCursor = (value: string): CallRecordListCursor => {
  return parseCreatedAtCursor(value);
};

export const parseCallRecordId = (value: unknown): string => {
  return ensureRequiredString(value, "callRecordId");
};

export const parseCreateCallRecordInput = parseCallRecordPayload;

export const parseListCallRecordsInput = (value: unknown): ListCallRecordsInput => {
  const query = ensureObject(value, "query");
  const pageParams = parseCursorPageParams(value, {
    parseCursor: parseCallRecordListCursor,
  });

  return {
    ...pageParams,
    phoneNumber: parseOptionalPhoneNumber(query.phoneNumber, "phoneNumber"),
  };
};
