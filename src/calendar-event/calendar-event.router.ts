import { createCrudRouter } from "../lib/crud-router.js";
import { listCalendarEvents } from "./calendar-event.service.js";
import { parseListCalendarEventsInput } from "./calendar-event.validation.js";

export const calendarEventRouter = createCrudRouter({
  list: {
    responseKey: "events",
    parseInput: parseListCalendarEventsInput,
    handler: listCalendarEvents,
  },
});
