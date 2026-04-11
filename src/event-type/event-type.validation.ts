import { createCrudValidators, ensureRequiredString } from "../lib/crud-validation.js";
import { parseCreatedAtCursor } from "../lib/listing.js";
import type {
  EventTypeListCursor,
  EventTypePayload,
  ListEventTypesInput,
} from "./event-type.service.js";

const parseEventTypePayload = (payload: Record<string, unknown>) => {
  return {
    name: ensureRequiredString(payload.name, "name"),
  };
};

const parseEventTypeListCursor = (value: string): EventTypeListCursor => {
  return parseCreatedAtCursor(value);
};

const eventTypeValidators = createCrudValidators<EventTypePayload, EventTypeListCursor>({
  idFieldName: "eventTypeId",
  parseCursor: parseEventTypeListCursor,
  parseCreateBody: parseEventTypePayload,
});

export const parseEventTypeId = eventTypeValidators.parseId;
export const parseListEventTypesInput: (value: unknown) => ListEventTypesInput =
  eventTypeValidators.parseListInput;
export const parseCreateEventTypeInput = eventTypeValidators.parseCreateInput;
export const parseUpdateEventTypeInput = eventTypeValidators.parseUpdateInput;
