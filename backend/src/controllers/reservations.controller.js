import asyncHandler from "../utils/async-handler.js";
import {
  createReservation,
  deleteReservation,
  listReservations,
  updateReservation,
} from "../services/reservations.service.js";

export const getReservations = asyncHandler(async (req, res) => {
  const reservations = await listReservations(req.user.id);
  res.json({ reservations });
});

export const postReservation = asyncHandler(async (req, res) => {
  const reservation = await createReservation(req.user.id, req.body);
  res.status(201).json({ reservation });
});

export const putReservation = asyncHandler(async (req, res) => {
  const reservation = await updateReservation(req.user.id, req.params.id, req.body);
  res.json({ reservation });
});

export const removeReservation = asyncHandler(async (req, res) => {
  await deleteReservation(req.user.id, req.params.id);
  res.status(204).send();
});

