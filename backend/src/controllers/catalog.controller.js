import asyncHandler from "../utils/async-handler.js";
import {
  createCatalogPack,
  createCatalogTaxRate,
  deleteCatalogCategory,
  deleteCatalogPack,
  deleteCatalogTaxRate,
  duplicateCatalogItem,
  duplicateCatalogPack,
  listCatalogCategories,
  listCatalogPacks,
  listCatalogTaxRates,
  listItemProfiles,
  updateCatalogPack,
  updateCatalogTaxRate,
  upsertCatalogCategory,
  upsertItemProfile,
} from "../services/catalog.service.js";

export const getCatalogCategories = asyncHandler(async (req, res) => {
  const categories = await listCatalogCategories(req.user.id);
  res.json({ categories });
});

export const postCatalogCategory = asyncHandler(async (req, res) => {
  const category = await upsertCatalogCategory(req.user.id, req.body);
  res.status(201).json({ category });
});

export const removeCatalogCategory = asyncHandler(async (req, res) => {
  await deleteCatalogCategory(req.user.id, req.params.slug);
  res.status(204).send();
});

export const getCatalogTaxRates = asyncHandler(async (req, res) => {
  const taxRates = await listCatalogTaxRates(req.user.id);
  res.json({ taxRates });
});

export const postCatalogTaxRate = asyncHandler(async (req, res) => {
  const taxRate = await createCatalogTaxRate(req.user.id, req.body);
  res.status(201).json({ taxRate });
});

export const putCatalogTaxRate = asyncHandler(async (req, res) => {
  const taxRate = await updateCatalogTaxRate(req.user.id, req.params.taxRateId, req.body);
  res.json({ taxRate });
});

export const removeCatalogTaxRate = asyncHandler(async (req, res) => {
  await deleteCatalogTaxRate(req.user.id, req.params.taxRateId);
  res.status(204).send();
});

export const getItemProfiles = asyncHandler(async (req, res) => {
  const itemProfiles = await listItemProfiles(req.user.id);
  res.json({ itemProfiles });
});

export const putItemProfile = asyncHandler(async (req, res) => {
  const itemProfile = await upsertItemProfile(req.user.id, req.params.itemId, req.body);
  res.json({ itemProfile });
});

export const postDuplicateCatalogItem = asyncHandler(async (req, res) => {
  const duplicatedItem = await duplicateCatalogItem(req.user.id, req.params.itemId);
  res.status(201).json(duplicatedItem);
});

export const getCatalogPacks = asyncHandler(async (req, res) => {
  const packs = await listCatalogPacks(req.user.id);
  res.json({ packs });
});

export const postCatalogPack = asyncHandler(async (req, res) => {
  const pack = await createCatalogPack(req.user.id, req.body);
  res.status(201).json({ pack });
});

export const putCatalogPack = asyncHandler(async (req, res) => {
  const pack = await updateCatalogPack(req.user.id, req.params.packId, req.body);
  res.json({ pack });
});

export const removeCatalogPack = asyncHandler(async (req, res) => {
  await deleteCatalogPack(req.user.id, req.params.packId);
  res.status(204).send();
});

export const postDuplicateCatalogPack = asyncHandler(async (req, res) => {
  const pack = await duplicateCatalogPack(req.user.id, req.params.packId);
  res.status(201).json({ pack });
});
