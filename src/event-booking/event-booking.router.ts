import { createCrudRouter } from "../lib/crud-router.js";
import {
  createEventBooking,
  deleteEventBooking,
  updateEventBooking,
} from "./event-booking.service.js";
import {
  parseCreateEventBookingInput,
  parseEventBookingId,
  parseUpdateEventBookingInput,
} from "./event-booking.validation.js";

export const eventBookingRouter = createCrudRouter({
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
