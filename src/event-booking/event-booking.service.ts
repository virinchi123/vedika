import type {
  EventBookingGetPayload,
  EventBookingSelect,
} from "../generated/prisma/models/EventBooking.js";
import { Prisma } from "../generated/prisma/client.js";
import type { EventBookingMode } from "../generated/prisma/enums.js";
import { HttpError } from "../auth/http-error.js";
import { prisma } from "../lib/prisma.js";

const eventBookingSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  mode: true,
  bookingStatusId: true,
  eventStatusId: true,
  eventTypeId: true,
  bookingStart: true,
  bookingEnd: true,
  muhurat: true,
  customerName: true,
  phoneNumber1: true,
  phoneNumber2: true,
  phoneNumber3: true,
  referredBy: true,
} satisfies EventBookingSelect;

type EventBookingRecord = EventBookingGetPayload<{
  select: typeof eventBookingSelect;
}>;

export type EventBookingPayload = {
  mode: EventBookingMode;
  bookingStatusId: string;
  eventStatusId: string;
  eventTypeId: string;
  bookingStart: Date;
  bookingEnd: Date;
  muhurat: Date | null;
  customerName: string;
  phoneNumber1: string;
  phoneNumber2: string | null;
  phoneNumber3: string | null;
  referredBy: string | null;
  serviceProviderIds: string[];
};

export type EventBookingResponse = EventBookingRecord;

const bookingStatusNotFoundError = () => new HttpError(404, "Booking status not found.");
const eventStatusNotFoundError = () => new HttpError(404, "Event status not found.");
const eventTypeNotFoundError = () => new HttpError(404, "Event type not found.");
const serviceProviderNotFoundError = () => new HttpError(404, "Service provider not found.");

const assertBookingStatusExists = async (bookingStatusId: string): Promise<void> => {
  const bookingStatus = await prisma.bookingStatus.findUnique({
    where: {
      id: bookingStatusId,
    },
    select: {
      id: true,
    },
  });

  if (bookingStatus === null) {
    throw bookingStatusNotFoundError();
  }
};

const assertEventStatusExists = async (eventStatusId: string): Promise<void> => {
  const eventStatus = await prisma.eventStatus.findUnique({
    where: {
      id: eventStatusId,
    },
    select: {
      id: true,
    },
  });

  if (eventStatus === null) {
    throw eventStatusNotFoundError();
  }
};

const assertEventTypeExists = async (eventTypeId: string): Promise<void> => {
  const eventType = await prisma.eventType.findUnique({
    where: {
      id: eventTypeId,
    },
    select: {
      id: true,
    },
  });

  if (eventType === null) {
    throw eventTypeNotFoundError();
  }
};

const assertServiceProvidersExist = async (serviceProviderIds: string[]): Promise<void> => {
  if (serviceProviderIds.length === 0) {
    return;
  }

  const serviceProviders = await prisma.serviceProvider.findMany({
    where: {
      id: {
        in: serviceProviderIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (serviceProviders.length !== serviceProviderIds.length) {
    throw serviceProviderNotFoundError();
  }
};

const assertReferencesExist = async (data: EventBookingPayload): Promise<void> => {
  await assertBookingStatusExists(data.bookingStatusId);
  await assertEventStatusExists(data.eventStatusId);
  await assertEventTypeExists(data.eventTypeId);
  await assertServiceProvidersExist(data.serviceProviderIds);
};

const findMissingReferenceError = async (
  data: EventBookingPayload,
): Promise<HttpError | null> => {
  const bookingStatus = await prisma.bookingStatus.findUnique({
    where: {
      id: data.bookingStatusId,
    },
    select: {
      id: true,
    },
  });

  if (bookingStatus === null) {
    return bookingStatusNotFoundError();
  }

  const eventStatus = await prisma.eventStatus.findUnique({
    where: {
      id: data.eventStatusId,
    },
    select: {
      id: true,
    },
  });

  if (eventStatus === null) {
    return eventStatusNotFoundError();
  }

  const eventType = await prisma.eventType.findUnique({
    where: {
      id: data.eventTypeId,
    },
    select: {
      id: true,
    },
  });

  if (eventType === null) {
    return eventTypeNotFoundError();
  }

  if (data.serviceProviderIds.length === 0) {
    return null;
  }

  const serviceProviders = await prisma.serviceProvider.findMany({
    where: {
      id: {
        in: data.serviceProviderIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (serviceProviders.length !== data.serviceProviderIds.length) {
    return serviceProviderNotFoundError();
  }

  return null;
};

const isForeignKeyError = (error: unknown): boolean => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
};

export const createEventBooking = async (
  data: EventBookingPayload,
): Promise<EventBookingResponse> => {
  await assertReferencesExist(data);
  const { serviceProviderIds, ...eventBookingData } = data;

  try {
    return await prisma.eventBooking.create({
      data: {
        ...eventBookingData,
        serviceProviders: {
          connect: serviceProviderIds.map((id) => ({ id })),
        },
      },
      select: eventBookingSelect,
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw (await findMissingReferenceError(data)) ?? error;
    }

    throw error;
  }
};

export const updateEventBooking = async (
  id: string,
  data: EventBookingPayload,
): Promise<EventBookingResponse> => {
  const existingEventBooking = await prisma.eventBooking.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (existingEventBooking === null) {
    throw new HttpError(404, "Event booking not found.");
  }

  await assertReferencesExist(data);
  const { serviceProviderIds, ...eventBookingData } = data;

  try {
    return await prisma.eventBooking.update({
      where: {
        id,
      },
      data: {
        ...eventBookingData,
        serviceProviders: {
          set: serviceProviderIds.map((providerId) => ({ id: providerId })),
        },
      },
      select: eventBookingSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new HttpError(404, "Event booking not found.");
    }

    if (isForeignKeyError(error)) {
      throw (await findMissingReferenceError(data)) ?? error;
    }

    throw error;
  }
};

export const deleteEventBooking = async (id: string): Promise<void> => {
  try {
    await prisma.eventBooking.delete({
      where: {
        id,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new HttpError(404, "Event booking not found.");
    }

    throw error;
  }
};
