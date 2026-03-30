import { Router } from "express";

import {
  getCustomerPaymentsSettings,
  postCustomerPaymentsConnectLink,
  postCustomerPaymentsDisconnect,
  putCustomerPaymentsSettings,
} from "../controllers/customer-payments.controller.js";

const router = Router();

router.get("/settings", getCustomerPaymentsSettings);
router.put("/settings", putCustomerPaymentsSettings);
router.post("/connect-link", postCustomerPaymentsConnectLink);
router.post("/disconnect", postCustomerPaymentsDisconnect);

export default router;
