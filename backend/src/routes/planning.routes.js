import { Router } from "express";

import { planning } from "../controllers/planning.controller.js";

const router = Router();

router.get("/", planning);

export default router;
