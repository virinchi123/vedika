import type {
  EventStatusGetPayload,
  EventStatusSelect,
} from "../generated/prisma/models/EventStatus.js";
import {
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { createCreatedAtCrudService } from "../lib/crud-service.js";
import { prisma } from "../lib/prisma.js";

const eventStatusSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies EventStatusSelect;

export type EventStatusPayload = {
  name: string;
};

export type EventStatusListCursor = CreatedAtCursor;

export type EventStatusResponse = EventStatusGetPayload<{
  select: typeof eventStatusSelect;
}>;

export type ListEventStatusesInput = CursorPageParams<EventStatusListCursor>;
export type ListEventStatusesResponse = CursorListResult<EventStatusResponse>;

const eventStatusConflictMessages = {
  name: "An event status with that name already exists.",
} as const;

const eventStatusCrud = createCreatedAtCrudService<
  EventStatusPayload,
  typeof eventStatusSelect,
  EventStatusResponse
>({
  delegate: prisma.eventStatus,
  select: eventStatusSelect,
  notFoundMessage: "Event status not found.",
  uniqueConstraintMessages: eventStatusConflictMessages,
});

export const createEventStatus = eventStatusCrud.create;
export const listEventStatuses: (input: ListEventStatusesInput) => Promise<ListEventStatusesResponse> =
  eventStatusCrud.list;
export const updateEventStatus = eventStatusCrud.update;
export const deleteEventStatus = eventStatusCrud.remove;
