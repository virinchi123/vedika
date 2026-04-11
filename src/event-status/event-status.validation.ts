import { createCrudValidators, ensureRequiredString } from "../lib/crud-validation.js";
import { parseCreatedAtCursor } from "../lib/listing.js";
import type {
  EventStatusListCursor,
  EventStatusPayload,
  ListEventStatusesInput,
} from "./event-status.service.js";

const parseEventStatusPayload = (payload: Record<string, unknown>) => {
  return {
    name: ensureRequiredString(payload.name, "name"),
  };
};

const parseEventStatusListCursor = (value: string): EventStatusListCursor => {
  return parseCreatedAtCursor(value);
};

const eventStatusValidators = createCrudValidators<EventStatusPayload, EventStatusListCursor>({
  idFieldName: "eventStatusId",
  parseCursor: parseEventStatusListCursor,
  parseCreateBody: parseEventStatusPayload,
});

export const parseEventStatusId = eventStatusValidators.parseId;
export const parseListEventStatusesInput: (value: unknown) => ListEventStatusesInput =
  eventStatusValidators.parseListInput;
export const parseCreateEventStatusInput = eventStatusValidators.parseCreateInput;
export const parseUpdateEventStatusInput = eventStatusValidators.parseUpdateInput;
