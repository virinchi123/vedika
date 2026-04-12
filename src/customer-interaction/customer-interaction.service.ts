import type {
  CustomerInteractionGetPayload,
  CustomerInteractionSelect,
} from "../generated/prisma/models/CustomerInteraction.js";
import { Prisma } from "../generated/prisma/client.js";
import type { CustomerInteractionType } from "../generated/prisma/enums.js";
import { HttpError } from "../auth/http-error.js";
import { prisma } from "../lib/prisma.js";

const customerInteractionSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  interactionType: true,
  occurredAt: true,
  eventBookingId: true,
} satisfies CustomerInteractionSelect;

type CustomerInteractionRecord = CustomerInteractionGetPayload<{
  select: typeof customerInteractionSelect;
}>;

export type CustomerInteractionPayload = {
  interactionType: CustomerInteractionType;
  occurredAt: Date;
  eventBookingId: string | null;
};

export type CustomerInteractionResponse = CustomerInteractionRecord;

const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");
const customerInteractionNotFoundError = () =>
  new HttpError(404, "Customer interaction not found.");

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const assertEventBookingExists = async (eventBookingId: string | null): Promise<void> => {
  if (eventBookingId === null) {
    return;
  }

  const eventBooking = await prisma.eventBooking.findUnique({
    where: {
      id: eventBookingId,
    },
    select: {
      id: true,
    },
  });

  if (eventBooking === null) {
    throw eventBookingNotFoundError();
  }
};

export const createCustomerInteraction = async (
  data: CustomerInteractionPayload,
): Promise<CustomerInteractionResponse> => {
  await assertEventBookingExists(data.eventBookingId);

  try {
    return await prisma.customerInteraction.create({
      data,
      select: customerInteractionSelect,
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw eventBookingNotFoundError();
    }

    throw error;
  }
};

export const updateCustomerInteraction = async (
  id: string,
  data: CustomerInteractionPayload,
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

  await assertEventBookingExists(data.eventBookingId);

  try {
    return await prisma.customerInteraction.update({
      where: {
        id,
      },
      data,
      select: customerInteractionSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw customerInteractionNotFoundError();
    }

    if (isForeignKeyError(error)) {
      throw eventBookingNotFoundError();
    }

    throw error;
  }
};

export const deleteCustomerInteraction = async (id: string): Promise<void> => {
  try {
    await prisma.customerInteraction.delete({
      where: {
        id,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw customerInteractionNotFoundError();
    }

    throw error;
  }
};
