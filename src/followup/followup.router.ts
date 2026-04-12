import { createCrudRouter } from "../lib/crud-router.js";
import {
  createFollowup,
  deleteFollowup,
  getFollowupById,
  listFollowups,
} from "./followup.service.js";
import {
  parseCreateFollowupInput,
  parseFollowupId,
  parseListFollowupsInput,
} from "./followup.validation.js";

export const followupRouter = createCrudRouter({
  list: {
    responseKey: "followups",
    parseInput: parseListFollowupsInput,
    handler: listFollowups,
  },
  getById: {
    responseKey: "followup",
    parseId: parseFollowupId,
    handler: getFollowupById,
  },
  create: {
    responseKey: "followup",
    parseInput: parseCreateFollowupInput,
    handler: createFollowup,
  },
  delete: {
    parseId: parseFollowupId,
    handler: deleteFollowup,
  },
});
