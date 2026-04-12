import { createCrudValidators, ensureRequiredString } from "../lib/crud-validation.js";
import { parseCreatedAtCursor } from "../lib/listing.js";
import type {
  BookingStatusListCursor,
  BookingStatusPayload,
  ListBookingStatusesInput,
} from "./booking-status.service.js";

const parseBookingStatusPayload = (payload: Record<string, unknown>) => {
  return {
    name: ensureRequiredString(payload.name, "name"),
  };
};

const parseBookingStatusListCursor = (value: string): BookingStatusListCursor => {
  return parseCreatedAtCursor(value);
};

const bookingStatusValidators = createCrudValidators<
  BookingStatusPayload,
  BookingStatusListCursor
>({
  idFieldName: "bookingStatusId",
  parseCursor: parseBookingStatusListCursor,
  parseCreateBody: parseBookingStatusPayload,
});

export const parseBookingStatusId = bookingStatusValidators.parseId;
export const parseListBookingStatusesInput: (value: unknown) => ListBookingStatusesInput =
  bookingStatusValidators.parseListInput;
export const parseCreateBookingStatusInput = bookingStatusValidators.parseCreateInput;
