import type {
  EventBookingGetPayload,
  EventBookingSelect,
} from "../generated/prisma/models/EventBooking.js";
import { Prisma } from "../generated/prisma/client.js";
import type { EventBookingMode } from "../generated/prisma/enums.js";
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

const eventBookingDetailSelect = {
  ...eventBookingSelect,
  serviceProviders: {
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
  },
  services: {
    select: {
      id: true,
      serviceProviderId: true,
      contractedAmount: true,
      customerPaidAmount: true,
      grossCommission: true,
      deduction: true,
      commissionPaidAmount: true,
    },
    orderBy: {
      serviceProviderId: "asc",
    },
  },
} satisfies EventBookingSelect;

type EventBookingDetailRecord = EventBookingGetPayload<{
  select: typeof eventBookingDetailSelect;
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
export type EventBookingDetailResponse = Omit<
  EventBookingDetailRecord,
  "serviceProviders" | "services"
> & {
  serviceProviderIds: string[];
  services: Array<{
    id: string;
    serviceProviderId: string;
    contractedAmount: string | null;
    customerPaidAmount: string | null;
    grossCommission: string | null;
    deduction: string | null;
    commissionPaidAmount: string | null;
  }>;
};
export type EventBookingListCursor = CreatedAtCursor;
export type ListEventBookingsInput = CursorPageParams<EventBookingListCursor> & {
  name: string | null;
  fromDate: Date | null;
  toDate: Date | null;
  phoneNumber: string | null;
};
export type ListEventBookingsResponse = CursorListResult<EventBookingResponse>;

const bookingStatusNotFoundError = () => new HttpError(404, "Booking status not found.");
const eventStatusNotFoundError = () => new HttpError(404, "Event status not found.");
const eventTypeNotFoundError = () => new HttpError(404, "Event type not found.");
const serviceProviderNotFoundError = () => new HttpError(404, "Service provider not found.");
const eventBookingNotFoundError = () => new HttpError(404, "Event booking not found.");

const serializeDecimal = (value: Prisma.Decimal | null): string | null => {
  return value === null ? null : value.toFixed(2);
};

const serializeEventBookingDetail = (
  eventBooking: EventBookingDetailRecord,
): EventBookingDetailResponse => {
  const { serviceProviders, services, ...eventBookingData } = eventBooking;

  return {
    ...eventBookingData,
    serviceProviderIds: serviceProviders.map((serviceProvider) => serviceProvider.id),
    services: services.map((service) => ({
      id: service.id,
      serviceProviderId: service.serviceProviderId,
      contractedAmount: serializeDecimal(service.contractedAmount),
      customerPaidAmount: serializeDecimal(service.customerPaidAmount),
      grossCommission: serializeDecimal(service.grossCommission),
      deduction: serializeDecimal(service.deduction),
      commissionPaidAmount: serializeDecimal(service.commissionPaidAmount),
    })),
  };
};

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

const buildServiceRows = (
  eventBookingId: string,
  serviceProviderIds: string[],
): Array<{
  eventBookingId: string;
  serviceProviderId: string;
  contractedAmount: null;
  customerPaidAmount: null;
  grossCommission: null;
  deduction: null;
  commissionPaidAmount: null;
}> => {
  return serviceProviderIds.map((serviceProviderId) => ({
    eventBookingId,
    serviceProviderId,
    contractedAmount: null,
    customerPaidAmount: null,
    grossCommission: null,
    deduction: null,
    commissionPaidAmount: null,
  }));
};

const syncServicesForEventBooking = async (
  tx: Prisma.TransactionClient,
  eventBookingId: string,
  serviceProviderIds: string[],
): Promise<void> => {
  const existingServices = await tx.service.findMany({
    where: {
      eventBookingId,
    },
    select: {
      serviceProviderId: true,
    },
  });

  const nextProviderIds = new Set(serviceProviderIds);
  const existingProviderIds = new Set(
    existingServices.map((service) => service.serviceProviderId),
  );

  const providerIdsToCreate = serviceProviderIds.filter(
    (serviceProviderId) => !existingProviderIds.has(serviceProviderId),
  );
  const providerIdsToDelete = existingServices
    .map((service) => service.serviceProviderId)
    .filter((serviceProviderId) => !nextProviderIds.has(serviceProviderId));

  if (providerIdsToCreate.length > 0) {
    await tx.service.createMany({
      data: buildServiceRows(eventBookingId, providerIdsToCreate),
    });
  }

  if (providerIdsToDelete.length > 0) {
    await tx.service.deleteMany({
      where: {
        eventBookingId,
        serviceProviderId: {
          in: providerIdsToDelete,
        },
      },
    });
  }
};

export const listEventBookings = async ({
  limit,
  cursor,
  name,
  fromDate,
  toDate,
  phoneNumber,
}: ListEventBookingsInput): Promise<ListEventBookingsResponse> => {
  const whereConditions: Prisma.EventBookingWhereInput[] = [];
  const cursorWhere = buildCreatedAtDescCursorWhere(cursor);

  if (cursorWhere !== undefined) {
    whereConditions.push(cursorWhere);
  }

  if (name !== null) {
    whereConditions.push({
      customerName: {
        contains: name,
        mode: "insensitive",
      },
    });
  }

  if (phoneNumber !== null) {
    whereConditions.push({
      OR: [
        {
          phoneNumber1: phoneNumber,
        },
        {
          phoneNumber2: phoneNumber,
        },
        {
          phoneNumber3: phoneNumber,
        },
      ],
    });
  }

  if (fromDate !== null) {
    whereConditions.push({
      bookingEnd: {
        gte: fromDate,
      },
    });
  }

  if (toDate !== null) {
    whereConditions.push({
      bookingStart: {
        lte: toDate,
      },
    });
  }

  const eventBookings = await prisma.eventBooking.findMany({
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
    select: eventBookingSelect,
  });

  return buildCursorPage({
    items: eventBookings,
    limit,
    getCursor: getCreatedAtCursor,
  });
};

export const getEventBookingById = async (
  id: string,
): Promise<EventBookingDetailResponse> => {
  const eventBooking = await prisma.eventBooking.findUnique({
    where: {
      id,
    },
    select: eventBookingDetailSelect,
  });

  if (eventBooking === null) {
    throw eventBookingNotFoundError();
  }

  return serializeEventBookingDetail(eventBooking);
};

export const createEventBooking = async (
  data: EventBookingPayload,
): Promise<EventBookingResponse> => {
  await assertReferencesExist(data);
  const { serviceProviderIds, ...eventBookingData } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      const eventBooking = await tx.eventBooking.create({
        data: {
          ...eventBookingData,
          serviceProviders: {
            connect: serviceProviderIds.map((id) => ({ id })),
          },
        },
        select: eventBookingSelect,
      });

      if (serviceProviderIds.length > 0) {
        await tx.service.createMany({
          data: buildServiceRows(eventBooking.id, serviceProviderIds),
        });
      }

      return eventBooking;
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
      serviceProviders: {
        select: {
          id: true,
        },
      },
      services: {
        select: {
          serviceProviderId: true,
        },
      },
    },
  });

  if (existingEventBooking === null) {
    throw eventBookingNotFoundError();
  }

  await assertReferencesExist(data);
  const { serviceProviderIds, ...eventBookingData } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      const updatedEventBooking = await tx.eventBooking.update({
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

      const currentProviderIds = new Set(
        existingEventBooking.serviceProviders.map((provider) => provider.id),
      );
      const currentServiceProviderIds = new Set(
        existingEventBooking.services.map((service) => service.serviceProviderId),
      );
      const nextProviderIds = new Set(serviceProviderIds);
      const needsServiceSync =
        serviceProviderIds.some((serviceProviderId) => !currentProviderIds.has(serviceProviderId)) ||
        serviceProviderIds.some((serviceProviderId) => !currentServiceProviderIds.has(serviceProviderId)) ||
        existingEventBooking.services.some(
          (service) => !nextProviderIds.has(service.serviceProviderId),
        );

      if (needsServiceSync) {
        await syncServicesForEventBooking(tx, id, serviceProviderIds);
      }

      return updatedEventBooking;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw eventBookingNotFoundError();
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
      throw eventBookingNotFoundError();
    }

    throw error;
  }
};
