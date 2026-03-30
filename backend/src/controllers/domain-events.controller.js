import asyncHandler from "../utils/async-handler.js";
import { listDomainEvents } from "../services/domain-events.service.js";

export const getDomainEvents = asyncHandler(async (req, res) => {
  const data = await listDomainEvents(req.user, req.query);
  res.json(data);
});
