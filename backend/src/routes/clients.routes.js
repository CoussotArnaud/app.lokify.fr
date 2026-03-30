import { Router } from "express";

import {
  archiveClientController,
  getClients,
  getClientDetail,
  getClientDocumentDetail,
  getClientDocuments,
  postClient,
  postClientDocument,
  putClient,
  removeClient,
  removeClientDocument,
  restoreClientController,
} from "../controllers/clients.controller.js";

const router = Router();

router.get("/", getClients);
router.post("/", postClient);
router.get("/:id", getClientDetail);
router.post("/:id/archive", archiveClientController);
router.post("/:id/restore", restoreClientController);
router.get("/:id/documents", getClientDocuments);
router.get("/:id/documents/:documentId", getClientDocumentDetail);
router.post("/:id/documents", postClientDocument);
router.delete("/:id/documents/:documentId", removeClientDocument);
router.put("/:id", putClient);
router.delete("/:id", removeClient);

export default router;
