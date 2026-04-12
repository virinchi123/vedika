import type {
  FollowupGetPayload,
  FollowupSelect,
} from "../generated/prisma/models/Followup.js";
import { Prisma } from "../generated/prisma/client.js";
import type { FollowupType } from "../generated/prisma/enums.js";
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

const followupSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  dueDate: true,
  type: true,
  description: true,
  eventBookingId: true,
  serviceProviderId: true,
  customerInteractionId: true,
} satisfies FollowupSelect;

type FollowupRecord = FollowupGetPayload<{
  select: typeof followupSelect;
}>;

export type FollowupPayload = {
  dueDate: Date;
  type: FollowupType;
  description: string | null;
  eventBookingId: string | null;
  serviceProviderId: string | null;
  customerInteractionId: string | null;
};

export type FollowupResponse = FollowupRecord;
export type FollowupListCursor = CreatedAtCursor;
export type ListFollowupsInput = CursorPageParams<FollowupListCursor> & {
  dueDate: Date | null;
  type: FollowupType | null;
  eventBookingId: string | null;
  serviceProviderId: string | null;
};
export type ListFollowupsResponse = CursorListResult<FollowupResponse>;

const followupNotFoundError = () => new HttpError(404, "Followup not found.");
const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");
const serviceProviderNotFoundError = () => new HttpError(404, "Service provider not found.");
const customerInteractionNotFoundError = () =>
  new HttpError(404, "Customer interaction not found.");

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const assertEventBookingExists = async (id: string | null): Promise<void> => {
  if (id === null) {
    return;
  }

  const eventBooking = await prisma.eventBooking.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (eventBooking === null) {
    throw eventBookingNotFoundError();
  }
};

const assertServiceProviderExists = async (id: string | null): Promise<void> => {
  if (id === null) {
    return;
  }

  const serviceProvider = await prisma.serviceProvider.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (serviceProvider === null) {
    throw serviceProviderNotFoundError();
  }
};

const assertCustomerInteractionExists = async (id: string | null): Promise<void> => {
  if (id === null) {
    return;
  }

  const customerInteraction = await prisma.customerInteraction.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (customerInteraction === null) {
    throw customerInteractionNotFoundError();
  }
};

export const createFollowup = async (data: FollowupPayload): Promise<FollowupResponse> => {
  await assertEventBookingExists(data.eventBookingId);
  await assertServiceProviderExists(data.serviceProviderId);
  await assertCustomerInteractionExists(data.customerInteractionId);

  try {
    return await prisma.followup.create({
      data,
      select: followupSelect,
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      if (data.eventBookingId !== null) {
        throw eventBookingNotFoundError();
      }

      if (data.serviceProviderId !== null) {
        throw serviceProviderNotFoundError();
      }

      if (data.customerInteractionId !== null) {
        throw customerInteractionNotFoundError();
      }
    }

    throw error;
  }
};

export const getFollowupById = async (id: string): Promise<FollowupResponse> => {
  const followup = await prisma.followup.findUnique({
    where: {
      id,
    },
    select: followupSelect,
  });

  if (followup === null) {
    throw followupNotFoundError();
  }

  return followup;
};

export const listFollowups = async ({
  limit,
  cursor,
  dueDate,
  type,
  eventBookingId,
  serviceProviderId,
}: ListFollowupsInput): Promise<ListFollowupsResponse> => {
  const whereConditions: Prisma.FollowupWhereInput[] = [];
  const cursorWhere = buildCreatedAtDescCursorWhere(cursor);

  if (cursorWhere !== undefined) {
    whereConditions.push(cursorWhere);
  }

  if (dueDate !== null) {
    whereConditions.push({
      dueDate,
    });
  }

  if (type !== null) {
    whereConditions.push({
      type,
    });
  }

  if (eventBookingId !== null) {
    whereConditions.push({
      eventBookingId,
    });
  }

  if (serviceProviderId !== null) {
    whereConditions.push({
      serviceProviderId,
    });
  }

  const followups = await prisma.followup.findMany({
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
    select: followupSelect,
  });

  return buildCursorPage({
    items: followups,
    limit,
    getCursor: getCreatedAtCursor,
  });
};

export const deleteFollowup = async (id: string): Promise<void> => {
  try {
    await prisma.followup.delete({
      where: {
        id,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw followupNotFoundError();
    }

    throw error;
  }
};
