import { createCrudRouter } from "../lib/crud-router.js";
import {
  createCustomerInteraction,
  deleteCustomerInteraction,
  getCustomerInteractionById,
  listCustomerInteractions,
  updateCustomerInteraction,
} from "./customer-interaction.service.js";
import {
  parseCreateCustomerInteractionInput,
  parseCustomerInteractionId,
  parseListCustomerInteractionsInput,
  parseUpdateCustomerInteractionInput,
} from "./customer-interaction.validation.js";

export const customerInteractionRouter = createCrudRouter({
  list: {
    responseKey: "customerInteractions",
    parseInput: parseListCustomerInteractionsInput,
    handler: listCustomerInteractions,
  },
  getById: {
    responseKey: "customerInteraction",
    parseId: parseCustomerInteractionId,
    handler: getCustomerInteractionById,
  },
  create: {
    responseKey: "customerInteraction",
    parseInput: parseCreateCustomerInteractionInput,
    handler: createCustomerInteraction,
  },
  update: {
    responseKey: "customerInteraction",
    parseId: parseCustomerInteractionId,
    parseInput: parseUpdateCustomerInteractionInput,
    handler: updateCustomerInteraction,
  },
  delete: {
    parseId: parseCustomerInteractionId,
    handler: deleteCustomerInteraction,
  },
});
