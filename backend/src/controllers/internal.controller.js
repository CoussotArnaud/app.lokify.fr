import asyncHandler from "../utils/async-handler.js";
import { purgeExpiredArchivedRecords } from "../services/archive-maintenance.service.js";

export const getArchivePurgeController = asyncHandler(async (_req, res) => {
  const result = await purgeExpiredArchivedRecords({
    purgeTrigger: "cron",
  });

  res.json(result);
});
