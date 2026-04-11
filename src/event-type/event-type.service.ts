import type {
  EventTypeGetPayload,
  EventTypeSelect,
} from "../generated/prisma/models/EventType.js";
import {
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { createCreatedAtCrudService } from "../lib/crud-service.js";
import { prisma } from "../lib/prisma.js";

const eventTypeSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies EventTypeSelect;

export type EventTypePayload = {
  name: string;
};

export type EventTypeListCursor = CreatedAtCursor;

export type EventTypeResponse = EventTypeGetPayload<{
  select: typeof eventTypeSelect;
}>;

export type ListEventTypesInput = CursorPageParams<EventTypeListCursor>;
export type ListEventTypesResponse = CursorListResult<EventTypeResponse>;

const eventTypeConflictMessages = {
  name: "An event type with that name already exists.",
} as const;

const eventTypeCrud = createCreatedAtCrudService<EventTypePayload, typeof eventTypeSelect, EventTypeResponse>({
  delegate: prisma.eventType,
  select: eventTypeSelect,
  notFoundMessage: "Event type not found.",
  uniqueConstraintMessages: eventTypeConflictMessages,
});

export const createEventType = eventTypeCrud.create;
export const listEventTypes: (input: ListEventTypesInput) => Promise<ListEventTypesResponse> =
  eventTypeCrud.list;
export const updateEventType = eventTypeCrud.update;
export const deleteEventType = eventTypeCrud.remove;
