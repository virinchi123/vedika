import { createCrudRouter } from "../lib/crud-router.js";
import {
  createCallRecord,
  getCallRecordById,
  listCallRecords,
} from "./call-record.service.js";
import {
  parseCallRecordId,
  parseCreateCallRecordInput,
  parseListCallRecordsInput,
} from "./call-record.validation.js";

export const callRecordRouter = createCrudRouter({
  list: {
    responseKey: "callRecords",
    parseInput: parseListCallRecordsInput,
    handler: listCallRecords,
  },
  getById: {
    responseKey: "callRecord",
    parseId: parseCallRecordId,
    handler: getCallRecordById,
  },
  create: {
    responseKey: "callRecord",
    parseInput: parseCreateCallRecordInput,
    handler: createCallRecord,
  },
});
