import type {
  CustomerInteractionGetPayload,
  CustomerInteractionSelect,
} from "../generated/prisma/models/CustomerInteraction.js";
import { Prisma } from "../generated/prisma/client.js";
import type { CustomerInteractionType } from "../generated/prisma/enums.js";
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
import { findUniqueConstraintMessage } from "../lib/prisma-errors.js";
import { prisma } from "../lib/prisma.js";

const customerInteractionSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  interactionType: true,
  occurredAt: true,
  ignored: true,
  voiceNote: {
    select: {
      id: true,
    },
  },
  eventBookings: {
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
  },
} satisfies CustomerInteractionSelect;

const customerInteractionMutationSelect = {
  id: true,
  interactionType: true,
  voiceNote: {
    select: {
      id: true,
      fileId: true,
    },
  },
} satisfies CustomerInteractionSelect;

type CustomerInteractionRecord = CustomerInteractionGetPayload<{
  select: typeof customerInteractionSelect;
}>;

type CustomerInteractionMutationRecord = CustomerInteractionGetPayload<{
  select: typeof customerInteractionMutationSelect;
}>;

export type VoiceNoteInput = {
  gcsPath: string;
  extension: string;
  originalName: string | null;
};

export type CreateCustomerInteractionInput = {
  interactionType: CustomerInteractionType;
  occurredAt: Date;
  eventBookingIds: string[];
  voiceNote?: VoiceNoteInput;
};

export type UpdateCustomerInteractionInput = {
  interactionType: CustomerInteractionType;
  occurredAt: Date;
  eventBookingIds: string[];
  voiceNote?: VoiceNoteInput | null;
  clearVoiceNote: boolean;
};

export type CustomerInteractionIgnoreInput = {
  ignored: boolean;
};

export type CustomerInteractionEventBookingAssociationInput = {
  eventBookingIds: string[];
};

export type CustomerInteractionResponse = Omit<
  CustomerInteractionRecord,
  "eventBookings" | "voiceNote"
> & {
  eventBookingIds: string[];
  voiceNoteId: string | null;
};

export type CustomerInteractionListCursor = CreatedAtCursor;
export type ListCustomerInteractionsInput = CursorPageParams<CustomerInteractionListCursor> & {
  eventBookingId: string | null;
  ignored: boolean | null;
  unlinkedOnly: boolean;
};
export type ListCustomerInteractionsResponse = CursorListResult<CustomerInteractionResponse>;

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

const fileConflictMessages = {
  gcsPath: "A file with that gcsPath already exists.",
} as const;

const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");
const customerInteractionNotFoundError = () =>
  new HttpError(404, "Customer interaction not found.");
const voiceNoteWalkInOnlyError = () =>
  new HttpError(400, "voiceNote is only allowed for WALK_IN customer interactions.");
const clearVoiceNoteRequiredError = () =>
  new HttpError(
    400,
    "clearVoiceNote must be true when changing a walk-in with a voice note away from WALK_IN.",
  );

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const isMissingRecordError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
};

const throwFileConflictError = (error: unknown): never => {
  const conflictMessage = findUniqueConstraintMessage(error, fileConflictMessages);

  if (conflictMessage !== null) {
    throw new HttpError(409, conflictMessage);
  }

  throw error;
};

const serializeCustomerInteraction = (
  customerInteraction: CustomerInteractionRecord,
): CustomerInteractionResponse => {
  const { eventBookings, voiceNote, ...customerInteractionData } = customerInteraction;

  return {
    ...customerInteractionData,
    eventBookingIds: eventBookings.map((eventBooking) => eventBooking.id),
    voiceNoteId: voiceNote?.id ?? null,
  };
};

const assertEventBookingsExist = async (
  db: PrismaClientLike,
  eventBookingIds: string[],
): Promise<void> => {
  if (eventBookingIds.length === 0) {
    return;
  }

  const eventBookings = await db.eventBooking.findMany({
    where: {
      id: {
        in: eventBookingIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (eventBookings.length !== eventBookingIds.length) {
    throw eventBookingNotFoundError();
  }
};

const getCustomerInteractionResponse = async (
  db: PrismaClientLike,
  id: string,
): Promise<CustomerInteractionResponse> => {
  const customerInteraction = await db.customerInteraction.findUnique({
    where: {
      id,
    },
    select: customerInteractionSelect,
  });

  if (customerInteraction === null) {
    throw customerInteractionNotFoundError();
  }

  return serializeCustomerInteraction(customerInteraction);
};

const getCustomerInteractionForMutation = async (
  db: PrismaClientLike,
  id: string,
): Promise<CustomerInteractionMutationRecord | null> => {
  return db.customerInteraction.findUnique({
    where: {
      id,
    },
    select: customerInteractionMutationSelect,
  });
};

const createVoiceNote = async (
  db: Prisma.TransactionClient,
  customerInteractionId: string,
  voiceNote: VoiceNoteInput,
): Promise<void> => {
  const file = await db.file.create({
    data: {
      gcsPath: voiceNote.gcsPath,
      extension: voiceNote.extension,
      originalName: voiceNote.originalName,
    },
    select: {
      id: true,
    },
  });

  await db.voiceNote.create({
    data: {
      customerInteractionId,
      fileId: file.id,
    },
  });
};

const updateVoiceNote = async (
  db: Prisma.TransactionClient,
  existingVoiceNote: NonNullable<CustomerInteractionMutationRecord["voiceNote"]>,
  voiceNote: VoiceNoteInput,
): Promise<void> => {
  await db.file.update({
    where: {
      id: existingVoiceNote.fileId,
    },
    data: {
      gcsPath: voiceNote.gcsPath,
      extension: voiceNote.extension,
      originalName: voiceNote.originalName,
    },
  });
};

const deleteVoiceNoteAndMaybeFile = async (
  db: Prisma.TransactionClient,
  existingVoiceNote: NonNullable<CustomerInteractionMutationRecord["voiceNote"]>,
): Promise<void> => {
  await db.voiceNote.delete({
    where: {
      id: existingVoiceNote.id,
    },
  });

  const [remainingVoiceNotes, callRecords] = await Promise.all([
    db.voiceNote.count({
      where: {
        fileId: existingVoiceNote.fileId,
      },
    }),
    db.callRecord.count({
      where: {
        fileId: existingVoiceNote.fileId,
      },
    }),
  ]);

  if (remainingVoiceNotes === 0 && callRecords === 0) {
    await db.file.delete({
      where: {
        id: existingVoiceNote.fileId,
      },
    });
  }
};

export const createCustomerInteraction = async (
  data: CreateCustomerInteractionInput,
): Promise<CustomerInteractionResponse> => {
  if (data.voiceNote !== undefined && data.interactionType !== "WALK_IN") {
    throw voiceNoteWalkInOnlyError();
  }

  await assertEventBookingsExist(prisma, data.eventBookingIds);
  const { eventBookingIds, voiceNote, ...customerInteractionData } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      const customerInteraction = await tx.customerInteraction.create({
        data: {
          ...customerInteractionData,
          eventBookings: {
            connect: eventBookingIds.map((id) => ({ id })),
          },
        },
        select: {
          id: true,
        },
      });

      if (voiceNote !== undefined) {
        await createVoiceNote(tx, customerInteraction.id, voiceNote);
      }

      return getCustomerInteractionResponse(tx, customerInteraction.id);
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw eventBookingNotFoundError();
    }

    return throwFileConflictError(error);
  }
};

export const getCustomerInteractionById = async (
  id: string,
): Promise<CustomerInteractionResponse> => {
  return getCustomerInteractionResponse(prisma, id);
};

export const listCustomerInteractions = async ({
  limit,
  cursor,
  eventBookingId,
  ignored,
  unlinkedOnly,
}: ListCustomerInteractionsInput): Promise<ListCustomerInteractionsResponse> => {
  if (eventBookingId !== null) {
    await assertEventBookingsExist(prisma, [eventBookingId]);
  }

  const whereConditions: Prisma.CustomerInteractionWhereInput[] = [];
  const cursorWhere = buildCreatedAtDescCursorWhere(cursor);

  if (cursorWhere !== undefined) {
    whereConditions.push(cursorWhere);
  }

  if (eventBookingId !== null) {
    whereConditions.push({
      eventBookings: {
        some: {
          id: eventBookingId,
        },
      },
    });
  }

  if (ignored !== null) {
    whereConditions.push({
      ignored,
    });
  }

  if (unlinkedOnly) {
    whereConditions.push({
      eventBookings: {
        none: {},
      },
    });
  }

  const customerInteractions = await prisma.customerInteraction.findMany({
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
    select: customerInteractionSelect,
  });

  return buildCursorPage({
    items: customerInteractions.map(serializeCustomerInteraction),
    limit,
    getCursor: getCreatedAtCursor,
  });
};

export const updateCustomerInteraction = async (
  id: string,
  data: UpdateCustomerInteractionInput,
): Promise<CustomerInteractionResponse> => {
  if (
    data.voiceNote !== undefined &&
    data.voiceNote !== null &&
    data.interactionType !== "WALK_IN"
  ) {
    throw voiceNoteWalkInOnlyError();
  }

  const existingCustomerInteraction = await getCustomerInteractionForMutation(prisma, id);

  if (existingCustomerInteraction === null) {
    throw customerInteractionNotFoundError();
  }

  if (
    existingCustomerInteraction.voiceNote !== null &&
    data.interactionType !== "WALK_IN" &&
    !data.clearVoiceNote
  ) {
    throw clearVoiceNoteRequiredError();
  }

  await assertEventBookingsExist(prisma, data.eventBookingIds);
  const { eventBookingIds, voiceNote, clearVoiceNote, ...customerInteractionData } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.customerInteraction.update({
        where: {
          id,
        },
        data: {
          ...customerInteractionData,
          eventBookings: {
            set: eventBookingIds.map((eventBookingId) => ({ id: eventBookingId })),
          },
        },
        select: {
          id: true,
        },
      });

      if (clearVoiceNote && existingCustomerInteraction.voiceNote !== null) {
        await deleteVoiceNoteAndMaybeFile(tx, existingCustomerInteraction.voiceNote);
      } else if (voiceNote !== undefined && voiceNote !== null) {
        if (existingCustomerInteraction.voiceNote === null) {
          await createVoiceNote(tx, id, voiceNote);
        } else {
          await updateVoiceNote(tx, existingCustomerInteraction.voiceNote, voiceNote);
        }
      }

      return getCustomerInteractionResponse(tx, id);
    });
  } catch (error) {
    if (isMissingRecordError(error)) {
      throw customerInteractionNotFoundError();
    }

    if (isForeignKeyError(error)) {
      throw eventBookingNotFoundError();
    }

    return throwFileConflictError(error);
  }
};

export const updateCustomerInteractionIgnored = async (
  id: string,
  data: CustomerInteractionIgnoreInput,
): Promise<CustomerInteractionResponse> => {
  try {
    const customerInteraction = await prisma.customerInteraction.update({
      where: {
        id,
      },
      data: {
        ignored: data.ignored,
      },
      select: customerInteractionSelect,
    });

    return serializeCustomerInteraction(customerInteraction);
  } catch (error) {
    if (isMissingRecordError(error)) {
      throw customerInteractionNotFoundError();
    }

    throw error;
  }
};

export const associateCustomerInteractionEventBookings = async (
  id: string,
  data: CustomerInteractionEventBookingAssociationInput,
): Promise<CustomerInteractionResponse> => {
  const existingCustomerInteraction = await prisma.customerInteraction.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (existingCustomerInteraction === null) {
    throw customerInteractionNotFoundError();
  }

  await assertEventBookingsExist(prisma, data.eventBookingIds);

  try {
    const customerInteraction = await prisma.customerInteraction.update({
      where: {
        id,
      },
      data: {
        eventBookings: {
          connect: data.eventBookingIds.map((eventBookingId) => ({ id: eventBookingId })),
        },
      },
      select: customerInteractionSelect,
    });

    return serializeCustomerInteraction(customerInteraction);
  } catch (error) {
    if (isMissingRecordError(error)) {
      throw customerInteractionNotFoundError();
    }

    if (isForeignKeyError(error)) {
      throw eventBookingNotFoundError();
    }

    throw error;
  }
};

export const deleteCustomerInteraction = async (id: string): Promise<void> => {
  const existingCustomerInteraction = await getCustomerInteractionForMutation(prisma, id);

  if (existingCustomerInteraction === null) {
    throw customerInteractionNotFoundError();
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (existingCustomerInteraction.voiceNote !== null) {
        await deleteVoiceNoteAndMaybeFile(tx, existingCustomerInteraction.voiceNote);
      }

      await tx.customerInteraction.delete({
        where: {
          id,
        },
      });
    });
  } catch (error) {
    if (isMissingRecordError(error)) {
      throw customerInteractionNotFoundError();
    }

    throw error;
  }
};
