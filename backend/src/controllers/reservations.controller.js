import asyncHandler from "../utils/async-handler.js";
import {
  createReservation,
  deleteReservation,
  listReservations,
  updateReservation,
} from "../services/reservations.service.js";
import {
  listReservationStatuses,
  updateReservationStatuses,
} from "../services/reservation-statuses.service.js";

export const getReservations = asyncHandler(async (req, res) => {
  const reservations = await listReservations(req.user.id, req.query);
  res.json({ reservations });
});

export const postReservation = asyncHandler(async (req, res) => {
  const reservation = await createReservation(req.user.id, req.body);
  res.status(201).json({ reservation });
});

export const getReservationStatuses = asyncHandler(async (req, res) => {
  const statuses = await listReservationStatuses(req.user.id);
  res.json({ statuses });
});

export const putReservationStatuses = asyncHandler(async (req, res) => {
  const statuses = await updateReservationStatuses(req.user.id, req.body?.statuses);
  res.json({ statuses });
});

export const putReservation = asyncHandler(async (req, res) => {
  const reservation = await updateReservation(req.user.id, req.params.id, req.body);
  res.json({ reservation });
});

export const removeReservation = asyncHandler(async (req, res) => {
  await deleteReservation(req.user.id, req.params.id);
  res.status(204).send();
});
