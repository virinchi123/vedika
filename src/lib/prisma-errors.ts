import { Prisma } from "../generated/prisma/client.js";

type UniqueConstraintMessages = Readonly<Record<string, string>>;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
};

const getNestedValue = (value: unknown, path: readonly string[]): unknown => {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);
    if (record === null) {
      return undefined;
    }

    current = record[key];
  }

  return current;
};

const normalizeConstraintField = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  return value.replace(/^"(.*)"$/u, "$1");
};

const toUniqueConstraintKey = (fields: readonly string[]): string | null => {
  if (fields.length === 0) {
    return null;
  }

  return [...fields].sort().join(",");
};

export const getUniqueConstraintKey = (error: unknown): string | null => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }

  const legacyTarget = Array.isArray(error.meta?.target) ? error.meta.target : [];
  const adapterTarget = getNestedValue(error.meta, ["driverAdapterError", "cause", "constraint", "fields"]);
  const fields = [...legacyTarget, ...(Array.isArray(adapterTarget) ? adapterTarget : [])]
    .map(normalizeConstraintField)
    .filter((field): field is string => field !== null);

  return toUniqueConstraintKey([...new Set(fields)]);
};

export const findUniqueConstraintMessage = (
  error: unknown,
  messages: UniqueConstraintMessages,
): string | null => {
  const key = getUniqueConstraintKey(error);

  return key === null ? null : messages[key] ?? null;
};
