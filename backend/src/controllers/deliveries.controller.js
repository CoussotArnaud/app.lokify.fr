import asyncHandler from "../utils/async-handler.js";
import {
  createDeliveryTour,
  deleteDeliveryTour,
  getDeliveryOverview,
  moveDeliveryStop,
  updateDeliveryTour,
} from "../services/deliveries.service.js";

export const getDeliveries = asyncHandler(async (req, res) => {
  const overview = await getDeliveryOverview(req.user.id);
  res.json(overview);
});

export const postDeliveryTour = asyncHandler(async (req, res) => {
  const tour = await createDeliveryTour(req.user.id, req.body);
  res.status(201).json({ tour });
});

export const putDeliveryTour = asyncHandler(async (req, res) => {
  const tour = await updateDeliveryTour(req.user.id, req.params.tourId, req.body);
  res.json({ tour });
});

export const removeDeliveryTour = asyncHandler(async (req, res) => {
  await deleteDeliveryTour(req.user.id, req.params.tourId);
  res.status(204).send();
});

export const postMoveDeliveryStop = asyncHandler(async (req, res) => {
  const tour = await moveDeliveryStop(
    req.user.id,
    req.params.tourId,
    req.params.stopId,
    req.body?.direction
  );
  res.json({ tour });
});
