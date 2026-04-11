import type {
  DefaultBookingConfigurationGetPayload,
  DefaultBookingConfigurationSelect,
} from "../generated/prisma/models/DefaultBookingConfiguration.js";
import { HttpError } from "../auth/http-error.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { createCreatedAtCrudService } from "../lib/crud-service.js";
import { findUniqueConstraintMessage } from "../lib/prisma-errors.js";
import { prisma } from "../lib/prisma.js";

const defaultBookingConfigurationSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  eventTypeId: true,
  defaultStartTime: true,
  defaultDurationInMinutes: true,
} satisfies DefaultBookingConfigurationSelect;

type DefaultBookingConfigurationRecord = DefaultBookingConfigurationGetPayload<{
  select: typeof defaultBookingConfigurationSelect;
}>;

export type DefaultBookingConfigurationPayload = {
  eventTypeId: string;
  defaultStartTime: Date;
  defaultDurationInMinutes: number;
};

export type DefaultBookingConfigurationListCursor = CreatedAtCursor;

export type DefaultBookingConfigurationResponse = Omit<
  DefaultBookingConfigurationRecord,
  "defaultStartTime"
> & {
  defaultStartTime: string;
};

export type ListDefaultBookingConfigurationsInput =
  CursorPageParams<DefaultBookingConfigurationListCursor>;
export type ListDefaultBookingConfigurationsResponse =
  CursorListResult<DefaultBookingConfigurationResponse>;

const defaultBookingConfigurationConflictMessages = {
  eventTypeId: "A default booking configuration already exists for that event type.",
} as const;

const defaultBookingConfigurationCrud = createCreatedAtCrudService<
  DefaultBookingConfigurationPayload,
  typeof defaultBookingConfigurationSelect,
  DefaultBookingConfigurationRecord
>({
  delegate: prisma.defaultBookingConfiguration,
  select: defaultBookingConfigurationSelect,
  notFoundMessage: "Default booking configuration not found.",
  uniqueConstraintMessages: defaultBookingConfigurationConflictMessages,
});

const formatTimeOfDay = (value: Date): string => {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

const toResponse = (
  record: DefaultBookingConfigurationRecord,
): DefaultBookingConfigurationResponse => {
  return {
    ...record,
    defaultStartTime: formatTimeOfDay(record.defaultStartTime),
  };
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
    throw new HttpError(404, "Event type not found.");
  }
};

export const listDefaultBookingConfigurations = async ({
  limit,
  cursor,
}: ListDefaultBookingConfigurationsInput): Promise<ListDefaultBookingConfigurationsResponse> => {
  const result = await defaultBookingConfigurationCrud.list({
    limit,
    cursor,
  });

  return {
    items: result.items.map(toResponse),
    pageInfo: result.pageInfo,
  };
};

export const updateDefaultBookingConfiguration = async (
  id: string,
  data: DefaultBookingConfigurationPayload,
): Promise<DefaultBookingConfigurationResponse> => {
  const existingConfiguration = await prisma.defaultBookingConfiguration.findUnique({
    where: {
      id,
    },
    select: {
      eventTypeId: true,
    },
  });

  if (existingConfiguration === null) {
    throw new HttpError(404, "Default booking configuration not found.");
  }

  if (existingConfiguration.eventTypeId !== data.eventTypeId) {
    await assertEventTypeExists(data.eventTypeId);
  }

  try {
    const updatedConfiguration = await prisma.defaultBookingConfiguration.update({
      where: {
        id,
      },
      data,
      select: defaultBookingConfigurationSelect,
    });

    return toResponse(updatedConfiguration);
  } catch (error) {
    const conflictMessage = findUniqueConstraintMessage(
      error,
      defaultBookingConfigurationConflictMessages,
    );

    if (conflictMessage !== null) {
      throw new HttpError(409, conflictMessage);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new HttpError(404, "Event type not found.");
    }

    throw error;
  }
};
