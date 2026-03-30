import { Router } from "express";

import { getArchivePurgeController } from "../controllers/internal.controller.js";
import { cronAuthMiddleware } from "../middleware/cron-auth.js";

const router = Router();

router.get("/archive-purge", cronAuthMiddleware, getArchivePurgeController);

export default router;
