import { Router } from "express";

import {
  getDeliveries,
  postDeliveryTour,
  postMoveDeliveryStop,
  putDeliveryTour,
  removeDeliveryTour,
} from "../controllers/deliveries.controller.js";

const router = Router();

router.get("/", getDeliveries);
router.post("/", postDeliveryTour);
router.put("/:tourId", putDeliveryTour);
router.delete("/:tourId", removeDeliveryTour);
router.post("/:tourId/stops/:stopId/move", postMoveDeliveryStop);

export default router;
