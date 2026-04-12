import { createCrudRouter } from "../lib/crud-router.js";
import {
  createBookingStatus,
  deleteBookingStatus,
  listBookingStatuses,
} from "./booking-status.service.js";
import {
  parseBookingStatusId,
  parseCreateBookingStatusInput,
  parseListBookingStatusesInput,
} from "./booking-status.validation.js";

export const bookingStatusRouter = createCrudRouter({
  list: {
    responseKey: "bookingStatuses",
    parseInput: parseListBookingStatusesInput,
    handler: listBookingStatuses,
  },
  create: {
    responseKey: "bookingStatus",
    parseInput: parseCreateBookingStatusInput,
    handler: createBookingStatus,
  },
  delete: {
    parseId: parseBookingStatusId,
    handler: deleteBookingStatus,
  },
});
