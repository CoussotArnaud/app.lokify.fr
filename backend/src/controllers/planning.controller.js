import asyncHandler from "../utils/async-handler.js";
import { getPlanning } from "../services/planning.service.js";

export const planning = asyncHandler(async (req, res) => {
  const data = await getPlanning(req.user.id, req.query);
  res.json(data);
});

