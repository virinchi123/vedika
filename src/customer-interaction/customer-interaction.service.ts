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
  eventBookings: {
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
  },
} satisfies CustomerInteractionSelect;

type CustomerInteractionRecord = CustomerInteractionGetPayload<{
  select: typeof customerInteractionSelect;
}>;

export type CustomerInteractionPayload = {
  interactionType: CustomerInteractionType;
  occurredAt: Date;
  eventBookingIds: string[];
};

export type CustomerInteractionResponse = Omit<
  CustomerInteractionRecord,
  "eventBookings"
> & {
  eventBookingIds: string[];
};

const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");
const customerInteractionNotFoundError = () =>
  new HttpError(404, "Customer interaction not found.");

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

const serializeCustomerInteraction = (
  customerInteraction: CustomerInteractionRecord,
): CustomerInteractionResponse => {
  const { eventBookings, ...customerInteractionData } = customerInteraction;

  return {
    ...customerInteractionData,
    eventBookingIds: eventBookings.map((eventBooking) => eventBooking.id),
  };
};

const assertEventBookingsExist = async (eventBookingIds: string[]): Promise<void> => {
  if (eventBookingIds.length === 0) {
    return;
  }

  const eventBookings = await prisma.eventBooking.findMany({
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

export const createCustomerInteraction = async (
  data: CustomerInteractionPayload,
): Promise<CustomerInteractionResponse> => {
  await assertEventBookingsExist(data.eventBookingIds);
  const { eventBookingIds, ...customerInteractionData } = data;

  try {
    const customerInteraction = await prisma.customerInteraction.create({
      data: {
        ...customerInteractionData,
        eventBookings: {
          connect: eventBookingIds.map((id) => ({ id })),
        },
      },
      select: customerInteractionSelect,
    });

    return serializeCustomerInteraction(customerInteraction);
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

  await assertEventBookingsExist(data.eventBookingIds);
  const { eventBookingIds, ...customerInteractionData } = data;

  try {
    const customerInteraction = await prisma.customerInteraction.update({
      where: {
        id,
      },
      data: {
        ...customerInteractionData,
        eventBookings: {
          set: eventBookingIds.map((eventBookingId) => ({ id: eventBookingId })),
        },
      },
      select: customerInteractionSelect,
    });

    return serializeCustomerInteraction(customerInteraction);
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
