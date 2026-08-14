import { handlers as authHandlers } from "./auth";
import { handlers as videoHandlers } from "./videos";
import { handlers as seedHandlers } from "./_seed";

export const handlers = [...authHandlers, ...videoHandlers, ...seedHandlers];
