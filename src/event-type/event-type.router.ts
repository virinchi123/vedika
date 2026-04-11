import { createCrudRouter } from "../lib/crud-router.js";
import {
  createEventType,
  deleteEventType,
  listEventTypes,
  updateEventType,
} from "./event-type.service.js";
import {
  parseCreateEventTypeInput,
  parseEventTypeId,
  parseListEventTypesInput,
  parseUpdateEventTypeInput,
} from "./event-type.validation.js";

export const eventTypeRouter = createCrudRouter({
  list: {
    responseKey: "eventTypes",
    parseInput: parseListEventTypesInput,
    handler: listEventTypes,
  },
  create: {
    responseKey: "eventType",
    parseInput: parseCreateEventTypeInput,
    handler: createEventType,
  },
  update: {
    responseKey: "eventType",
    parseId: parseEventTypeId,
    parseInput: parseUpdateEventTypeInput,
    handler: updateEventType,
  },
  delete: {
    parseId: parseEventTypeId,
    handler: deleteEventType,
  },
});
