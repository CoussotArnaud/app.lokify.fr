import express, { Router } from "express";

import { postLokifyStripeWebhook } from "../controllers/lokify-billing.controller.js";

const router = Router();

router.post("/stripe", express.raw({ type: "application/json" }), postLokifyStripeWebhook);

export default router;
