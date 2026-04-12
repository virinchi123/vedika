import type {
  BookingStatusGetPayload,
  BookingStatusSelect,
} from "../generated/prisma/models/BookingStatus.js";
import {
  type CreatedAtCursor,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { createCreatedAtCrudService } from "../lib/crud-service.js";
import { prisma } from "../lib/prisma.js";

const bookingStatusSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies BookingStatusSelect;

export type BookingStatusPayload = {
  name: string;
};

export type BookingStatusListCursor = CreatedAtCursor;

export type BookingStatusResponse = BookingStatusGetPayload<{
  select: typeof bookingStatusSelect;
}>;

export type ListBookingStatusesInput = CursorPageParams<BookingStatusListCursor>;
export type ListBookingStatusesResponse = CursorListResult<BookingStatusResponse>;

const bookingStatusConflictMessages = {
  name: "A booking status with that name already exists.",
} as const;

const bookingStatusCrud = createCreatedAtCrudService<
  BookingStatusPayload,
  typeof bookingStatusSelect,
  BookingStatusResponse
>({
  delegate: prisma.bookingStatus,
  select: bookingStatusSelect,
  notFoundMessage: "Booking status not found.",
  uniqueConstraintMessages: bookingStatusConflictMessages,
});

export const createBookingStatus = bookingStatusCrud.create;
export const listBookingStatuses: (
  input: ListBookingStatusesInput,
) => Promise<ListBookingStatusesResponse> = bookingStatusCrud.list;
export const deleteBookingStatus = bookingStatusCrud.remove;
