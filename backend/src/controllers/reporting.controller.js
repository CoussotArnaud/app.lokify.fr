import asyncHandler from "../utils/async-handler.js";
import {
  getCashJournal,
  getDocumentsReport,
  getReservationDocument,
  getReportingOverview,
  getStatistics,
  updateReservationDocument,
} from "../services/reporting.service.js";

export const reportingOverview = asyncHandler(async (req, res) => {
  const data = await getReportingOverview(req.user.id);
  res.json(data);
});

export const reportingStatistics = asyncHandler(async (req, res) => {
  const data = await getStatistics(req.user.id, req.query);
  res.json(data);
});

export const reportingDocuments = asyncHandler(async (req, res) => {
  const data = await getDocumentsReport(req.user.id, req.query);
  res.json(data);
});

export const reportingDocumentDetail = asyncHandler(async (req, res) => {
  const document = await getReservationDocument(req.user.id, req.params.documentId);
  res.json({ document });
});

export const reportingDocumentUpdate = asyncHandler(async (req, res) => {
  const document = await updateReservationDocument(req.user.id, req.params.documentId, req.body);
  res.json({ document });
});

export const reportingCash = asyncHandler(async (req, res) => {
  const data = await getCashJournal(req.user.id);
  res.json(data);
});
