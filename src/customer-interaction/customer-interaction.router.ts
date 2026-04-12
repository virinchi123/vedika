import { createCrudRouter } from "../lib/crud-router.js";
import {
  createCustomerInteraction,
  deleteCustomerInteraction,
  updateCustomerInteraction,
} from "./customer-interaction.service.js";
import {
  parseCreateCustomerInteractionInput,
  parseCustomerInteractionId,
  parseUpdateCustomerInteractionInput,
} from "./customer-interaction.validation.js";

export const customerInteractionRouter = createCrudRouter({
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
