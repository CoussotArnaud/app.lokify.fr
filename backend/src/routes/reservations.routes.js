import { Router } from "express";

import {
  getReservationStatuses,
  getReservations,
  postReservation,
  putReservationStatuses,
  putReservation,
  removeReservation,
} from "../controllers/reservations.controller.js";

const router = Router();

router.get("/statuses", getReservationStatuses);
router.put("/statuses", putReservationStatuses);
router.get("/", getReservations);
router.post("/", postReservation);
router.put("/:id", putReservation);
router.delete("/:id", removeReservation);

export default router;
