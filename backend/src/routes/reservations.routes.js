import { Router } from "express";

import {
  getReservations,
  postReservation,
  putReservation,
  removeReservation,
} from "../controllers/reservations.controller.js";

const router = Router();

router.get("/", getReservations);
router.post("/", postReservation);
router.put("/:id", putReservation);
router.delete("/:id", removeReservation);

export default router;

