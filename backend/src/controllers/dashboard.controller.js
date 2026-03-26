import asyncHandler from "../utils/async-handler.js";
import { getDashboardOverview } from "../services/dashboard.service.js";

export const overview = asyncHandler(async (req, res) => {
  const data = await getDashboardOverview(req.user.id);
  res.json(data);
});

