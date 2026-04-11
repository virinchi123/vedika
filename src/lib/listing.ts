import { HttpError } from "../auth/http-error.js";

const defaultListLimit = 20;
const maxListLimit = 100;

type ParseCursorPageParamsOptions<TCursor> = {
  defaultLimit?: number;
  maxLimit?: number;
  parseCursor: (value: string) => TCursor;
};

export type CursorPageParams<TCursor> = {
  limit: number;
  cursor: TCursor | null;
};

export type PageInfo = {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
};

export type CursorListResult<TItem> = {
  items: TItem[];
  pageInfo: PageInfo;
};

const ensureQueryObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "query must be an object.");
  }

  return value as Record<string, unknown>;
};

const parseOptionalQueryString = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value) || typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string.`);
  }

  return value;
};

const parseLimit = (value: string | null, defaultLimit: number, configuredMaxLimit: number): number => {
  if (value === null) {
    return defaultLimit;
  }

  if (!/^\d+$/.test(value)) {
    throw new HttpError(400, "limit must be a positive integer.");
  }

  const parsedLimit = Number(value);

  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
    throw new HttpError(400, "limit must be a positive integer.");
  }

  return Math.min(parsedLimit, configuredMaxLimit);
};

export const parseCursorPageParams = <TCursor>(
  value: unknown,
  { defaultLimit = defaultListLimit, maxLimit = maxListLimit, parseCursor }: ParseCursorPageParamsOptions<TCursor>,
): CursorPageParams<TCursor> => {
  const query = ensureQueryObject(value);
  const cursorValue = parseOptionalQueryString(query.cursor, "cursor");

  return {
    limit: parseLimit(parseOptionalQueryString(query.limit, "limit"), defaultLimit, maxLimit),
    cursor: cursorValue === null ? null : parseCursor(cursorValue),
  };
};

export const encodeCursor = <TCursor>(value: TCursor): string => {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
};

export const decodeCursor = <TCursor>(value: string, fieldName: string): TCursor => {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as TCursor;
  } catch {
    throw new HttpError(400, `${fieldName} must be a valid cursor.`);
  }
};

export const buildCursorPage = <TItem, TCursor>({
  items,
  limit,
  getCursor,
}: {
  items: TItem[];
  limit: number;
  getCursor: (item: TItem) => TCursor;
}): CursorListResult<TItem> => {
  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;

  return {
    items: pageItems,
    pageInfo: {
      limit,
      hasNextPage,
      nextCursor: hasNextPage ? encodeCursor(getCursor(pageItems[pageItems.length - 1]!)) : null,
    },
  };
};
