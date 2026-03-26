import { Router } from "express";

import {
  getCustomerPaymentsSettings,
  putCustomerPaymentsSettings,
} from "../controllers/customer-payments.controller.js";

const router = Router();

router.get("/settings", getCustomerPaymentsSettings);
router.put("/settings", putCustomerPaymentsSettings);

export default router;
