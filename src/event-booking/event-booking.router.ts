import { createCrudRouter } from "../lib/crud-router.js";
import {
  createEventBooking,
  deleteEventBooking,
  listEventBookings,
  updateEventBooking,
} from "./event-booking.service.js";
import {
  parseCreateEventBookingInput,
  parseEventBookingId,
  parseListEventBookingsInput,
  parseUpdateEventBookingInput,
} from "./event-booking.validation.js";

export const eventBookingRouter = createCrudRouter({
  list: {
    responseKey: "eventBookings",
    parseInput: parseListEventBookingsInput,
    handler: listEventBookings,
  },
  create: {
    responseKey: "eventBooking",
    parseInput: parseCreateEventBookingInput,
    handler: createEventBooking,
  },
  update: {
    responseKey: "eventBooking",
    parseId: parseEventBookingId,
    parseInput: parseUpdateEventBookingInput,
    handler: updateEventBooking,
  },
  delete: {
    parseId: parseEventBookingId,
    handler: deleteEventBooking,
  },
});
