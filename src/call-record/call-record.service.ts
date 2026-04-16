import type {
  CallRecordGetPayload,
  CallRecordSelect,
} from "../generated/prisma/models/CallRecord.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../auth/http-error.js";
import {
  buildCreatedAtDescCursorOrderBy,
  buildCreatedAtDescCursorWhere,
  buildCursorPage,
  getCreatedAtCursor,
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { prisma } from "../lib/prisma.js";

const callRecordSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  callerNumber: true,
  receiverNumber: true,
  fileId: true,
} satisfies CallRecordSelect;

type CallRecordRecord = CallRecordGetPayload<{
  select: typeof callRecordSelect;
}>;

export type CallRecordPayload = {
  callerNumber: string;
  receiverNumber: string;
  fileId: string | null;
};

export type CallRecordResponse = CallRecordRecord;
export type CallRecordListCursor = CreatedAtCursor;
export type ListCallRecordsInput = CursorPageParams<CallRecordListCursor> & {
  phoneNumber: string | null;
};
export type ListCallRecordsResponse = CursorListResult<CallRecordResponse>;

const callRecordNotFoundError = () => new HttpError(404, "Call record not found.");
const fileNotFoundError = () => new HttpError(404, "File not found.");

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const assertFileExists = async (fileId: string | null): Promise<void> => {
  if (fileId === null) {
    return;
  }

  const file = await prisma.file.findUnique({
    where: {
      id: fileId,
    },
    select: {
      id: true,
    },
  });

  if (file === null) {
    throw fileNotFoundError();
  }
};

export const createCallRecord = async (
  data: CallRecordPayload,
): Promise<CallRecordResponse> => {
  await assertFileExists(data.fileId);

  try {
    return await prisma.callRecord.create({
      data,
      select: callRecordSelect,
    });
  } catch (error) {
    if (isForeignKeyError(error) && data.fileId !== null) {
      throw fileNotFoundError();
    }

    throw error;
  }
};

export const getCallRecordById = async (id: string): Promise<CallRecordResponse> => {
  const callRecord = await prisma.callRecord.findUnique({
    where: {
      id,
    },
    select: callRecordSelect,
  });

  if (callRecord === null) {
    throw callRecordNotFoundError();
  }

  return callRecord;
};

export const listCallRecords = async ({
  limit,
  cursor,
  phoneNumber,
}: ListCallRecordsInput): Promise<ListCallRecordsResponse> => {
  const whereConditions: Prisma.CallRecordWhereInput[] = [];
  const cursorWhere = buildCreatedAtDescCursorWhere(cursor);

  if (cursorWhere !== undefined) {
    whereConditions.push(cursorWhere);
  }

  if (phoneNumber !== null) {
    whereConditions.push({
      OR: [
        {
          callerNumber: phoneNumber,
        },
        {
          receiverNumber: phoneNumber,
        },
      ],
    });
  }

  const callRecords = await prisma.callRecord.findMany({
    where:
      whereConditions.length === 0
        ? undefined
        : whereConditions.length === 1
          ? whereConditions[0]
          : {
              AND: whereConditions,
            },
    orderBy: buildCreatedAtDescCursorOrderBy(),
    take: limit + 1,
    select: callRecordSelect,
  });

  return buildCursorPage({
    items: callRecords,
    limit,
    getCursor: getCreatedAtCursor,
  });
};
