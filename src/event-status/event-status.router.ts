import { createCrudRouter } from "../lib/crud-router.js";
import {
  createEventStatus,
  deleteEventStatus,
  listEventStatuses,
  updateEventStatus,
} from "./event-status.service.js";
import {
  parseCreateEventStatusInput,
  parseEventStatusId,
  parseListEventStatusesInput,
  parseUpdateEventStatusInput,
} from "./event-status.validation.js";

export const eventStatusRouter = createCrudRouter({
  list: {
    responseKey: "eventStatuses",
    parseInput: parseListEventStatusesInput,
    handler: listEventStatuses,
  },
  create: {
    responseKey: "eventStatus",
    parseInput: parseCreateEventStatusInput,
    handler: createEventStatus,
  },
  update: {
    responseKey: "eventStatus",
    parseId: parseEventStatusId,
    parseInput: parseUpdateEventStatusInput,
    handler: updateEventStatus,
  },
  delete: {
    parseId: parseEventStatusId,
    handler: deleteEventStatus,
  },
});
