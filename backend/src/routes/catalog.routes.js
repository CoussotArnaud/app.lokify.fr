import { Router } from "express";

import {
  getCatalogCategories,
  getCatalogPacks,
  getCatalogTaxRates,
  getItemProfiles,
  postCatalogPack,
  postCatalogCategory,
  postCatalogTaxRate,
  postDuplicateCatalogItem,
  postDuplicateCatalogPack,
  postItemProfilePhoto,
  putItemProfile,
  putCatalogPack,
  putCatalogTaxRate,
  removeCatalogCategory,
  removeCatalogPack,
  removeCatalogTaxRate,
} from "../controllers/catalog.controller.js";

const router = Router();

router.get("/categories", getCatalogCategories);
router.post("/categories", postCatalogCategory);
router.delete("/categories/:slug", removeCatalogCategory);
router.get("/tax-rates", getCatalogTaxRates);
router.post("/tax-rates", postCatalogTaxRate);
router.put("/tax-rates/:taxRateId", putCatalogTaxRate);
router.delete("/tax-rates/:taxRateId", removeCatalogTaxRate);
router.get("/item-profiles", getItemProfiles);
router.put("/item-profiles/:itemId", putItemProfile);
router.post("/item-profiles/:itemId/photos", postItemProfilePhoto);
router.post("/products/:itemId/duplicate", postDuplicateCatalogItem);
router.get("/packs", getCatalogPacks);
router.post("/packs", postCatalogPack);
router.put("/packs/:packId", putCatalogPack);
router.delete("/packs/:packId", removeCatalogPack);
router.post("/packs/:packId/duplicate", postDuplicateCatalogPack);

export default router;
