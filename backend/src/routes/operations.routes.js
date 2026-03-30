import { Router } from "express";

import {
  getItemUnits,
  getOperations,
  postGenerateItemUnits,
  postItemUnit,
  postReservationDeparture,
  postReservationReturn,
  putProductUnit,
} from "../controllers/operations.controller.js";

const router = Router();

router.get("/", getOperations);
router.get("/items/:itemId/units", getItemUnits);
router.post("/items/:itemId/units", postItemUnit);
router.post("/items/:itemId/units/generate-missing", postGenerateItemUnits);
router.put("/units/:unitId", putProductUnit);
router.post("/reservations/:reservationId/depart", postReservationDeparture);
router.post("/reservations/:reservationId/return", postReservationReturn);

export default router;
