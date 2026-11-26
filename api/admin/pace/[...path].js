import { createAdminApiHandler } from "../../../src/server/handler.js";

let handler;

export default async function adminPaceApi(request, response) {
  handler ??= createAdminApiHandler();
  return handler(request, response);
}
