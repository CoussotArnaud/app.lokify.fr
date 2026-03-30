import { Router } from "express";

import {
  reportingCash,
  reportingDocumentDetail,
  reportingDocumentUpdate,
  reportingDocuments,
  reportingOverview,
  reportingStatistics,
} from "../controllers/reporting.controller.js";

const router = Router();

router.get("/overview", reportingOverview);
router.get("/statistics", reportingStatistics);
router.get("/documents", reportingDocuments);
router.get("/documents/:documentId", reportingDocumentDetail);
router.put("/documents/:documentId", reportingDocumentUpdate);
router.get("/cash", reportingCash);

export default router;
