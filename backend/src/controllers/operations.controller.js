import asyncHandler from "../utils/async-handler.js";
import {
  completeReservationDeparture,
  completeReservationReturn,
  createProductUnit,
  generateMissingProductUnits,
  getOperationsOverview,
  listUnitsByItem,
  updateProductUnit,
} from "../services/operations.service.js";

export const getOperations = asyncHandler(async (req, res) => {
  const overview = await getOperationsOverview(req.user.id);
  res.json(overview);
});

export const getItemUnits = asyncHandler(async (req, res) => {
  const productUnits = await listUnitsByItem(req.user.id, req.params.itemId);
  res.json({ productUnits });
});

export const postItemUnit = asyncHandler(async (req, res) => {
  const productUnit = await createProductUnit(req.user.id, req.params.itemId, req.body);
  res.status(201).json({ productUnit });
});

export const postGenerateItemUnits = asyncHandler(async (req, res) => {
  const productUnits = await generateMissingProductUnits(req.user.id, req.params.itemId);
  res.json({ productUnits });
});

export const putProductUnit = asyncHandler(async (req, res) => {
  const productUnit = await updateProductUnit(req.user.id, req.params.unitId, req.body);
  res.json({ productUnit });
});

export const postReservationDeparture = asyncHandler(async (req, res) => {
  const departure = await completeReservationDeparture(req.user.id, req.params.reservationId, req.body);
  res.status(201).json({ departure });
});

export const postReservationReturn = asyncHandler(async (req, res) => {
  const reservationReturn = await completeReservationReturn(
    req.user.id,
    req.params.reservationId,
    req.body
  );
  res.status(201).json({ reservationReturn });
});
