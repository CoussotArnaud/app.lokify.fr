import asyncHandler from "../utils/async-handler.js";
import {
  createSupportTicketForProvider,
  getSupportOverviewForUser,
  getSupportTicketForUser,
  markSupportNotificationAsRead,
  postSupportTicketMessageForUser,
  updateSupportTicketStatusForAdmin,
} from "../services/support.service.js";

export const getSupportOverviewController = asyncHandler(async (req, res) => {
  const overview = await getSupportOverviewForUser(req.user);
  res.json(overview);
});

export const getSupportTicketController = asyncHandler(async (req, res) => {
  const detail = await getSupportTicketForUser(req.user, req.params.ticketId);
  res.json(detail);
});

export const postSupportTicketController = asyncHandler(async (req, res) => {
  const detail = await createSupportTicketForProvider(req.user, req.body);
  res.status(201).json(detail);
});

export const postSupportTicketMessageController = asyncHandler(async (req, res) => {
  const detail = await postSupportTicketMessageForUser(req.user, req.params.ticketId, req.body);
  res.json(detail);
});

export const patchSupportTicketStatusController = asyncHandler(async (req, res) => {
  const detail = await updateSupportTicketStatusForAdmin(
    req.user,
    req.params.ticketId,
    req.body.status
  );
  res.json(detail);
});

export const postSupportNotificationReadController = asyncHandler(async (req, res) => {
  const result = await markSupportNotificationAsRead(req.user.id, req.params.notificationId);
  res.json(result);
});
