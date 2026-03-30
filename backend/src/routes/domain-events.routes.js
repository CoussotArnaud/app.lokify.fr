import { Router } from "express";

import { getDomainEvents } from "../controllers/domain-events.controller.js";

const router = Router();

router.get("/", getDomainEvents);

export default router;
