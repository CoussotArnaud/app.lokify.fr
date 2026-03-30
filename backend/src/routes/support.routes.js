import { Router } from "express";

import {
  getSupportOverviewController,
  getSupportTicketController,
  patchSupportTicketStatusController,
  postSupportNotificationReadController,
  postSupportTicketController,
  postSupportTicketMessageController,
} from "../controllers/support.controller.js";

const router = Router();

router.get("/overview", getSupportOverviewController);
router.post("/tickets", postSupportTicketController);
router.get("/tickets/:ticketId", getSupportTicketController);
router.post("/tickets/:ticketId/messages", postSupportTicketMessageController);
router.patch("/tickets/:ticketId/status", patchSupportTicketStatusController);
router.post("/notifications/:notificationId/read", postSupportNotificationReadController);

export default router;
