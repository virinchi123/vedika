import { createCrudRouter } from "../lib/crud-router.js";
import { asyncHandler } from "../lib/async-handler.js";
import {
  createEventBooking,
  deleteEventBooking,
  getEventBookingById,
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

eventBookingRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const eventBooking = await getEventBookingById(
      parseEventBookingId(request.params.id),
    );

    response.status(200).json({
      eventBooking,
    });
  }),
);
