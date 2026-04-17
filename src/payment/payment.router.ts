import { createCrudRouter } from "../lib/crud-router.js";
import {
  createPayment,
  getPaymentById,
  listPayments,
  updatePayment,
} from "./payment.service.js";
import {
  parseCreatePaymentInput,
  parseListPaymentsInput,
  parsePaymentId,
  parseUpdatePaymentInput,
} from "./payment.validation.js";

export const paymentRouter = createCrudRouter({
  list: {
    responseKey: "payments",
    parseInput: parseListPaymentsInput,
    handler: listPayments,
  },
  getById: {
    responseKey: "payment",
    parseId: parsePaymentId,
    handler: getPaymentById,
  },
  create: {
    responseKey: "payment",
    parseInput: parseCreatePaymentInput,
    handler: createPayment,
  },
  update: {
    responseKey: "payment",
    parseId: parsePaymentId,
    parseInput: parseUpdatePaymentInput,
    handler: updatePayment,
  },
});
