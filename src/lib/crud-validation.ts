import { HttpError } from "../auth/http-error.js";
import { parseCursorPageParams, type CursorPageParams } from "./listing.js";

type CreateCrudValidatorsOptions<TPayload, TCursor> = {
  idFieldName: string;
  parseCursor: (value: string) => TCursor;
  parseCreateBody: (body: Record<string, unknown>) => TPayload;
  parseUpdateBody?: (body: Record<string, unknown>) => TPayload;
};

export const ensureObject = (value: unknown, fieldName: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
};

export const ensureRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return normalizedValue;
};

export const createCrudValidators = <TPayload, TCursor>({
  idFieldName,
  parseCursor,
  parseCreateBody,
  parseUpdateBody = parseCreateBody,
}: CreateCrudValidatorsOptions<TPayload, TCursor>) => {
  return {
    parseId: (value: unknown): string => {
      return ensureRequiredString(value, idFieldName);
    },

    parseListInput: (value: unknown): CursorPageParams<TCursor> => {
      return parseCursorPageParams(value, {
        parseCursor,
      });
    },

    parseCreateInput: (value: unknown): TPayload => {
      return parseCreateBody(ensureObject(value, "body"));
    },

    parseUpdateInput: (value: unknown): TPayload => {
      return parseUpdateBody(ensureObject(value, "body"));
    },
  };
};
