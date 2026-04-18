import { createCrudRouter } from "../lib/crud-router.js";
import { createFile } from "./file.service.js";
import { parseCreateFileInput } from "./file.validation.js";

export const fileRouter = createCrudRouter({
  create: {
    responseKey: "file",
    parseInput: parseCreateFileInput,
    handler: createFile,
  },
});
