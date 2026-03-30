import asyncHandler from "../utils/async-handler.js";
import {
  getCurrentUser,
  loginUser,
  previewSiretVerification,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import { updateCurrentUserProfile } from "../services/current-user.service.js";

export const register = asyncHandler(async (req, res) => {
  const response = await registerUser(req.body);
  res.status(201).json(response);
});

export const login = asyncHandler(async (req, res) => {
  const response = await loginUser(req.body);
  res.json(response);
});

export const me = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user.id, req.authSession);
  res.json({ user });
});

export const putMe = asyncHandler(async (req, res) => {
  const user = await updateCurrentUserProfile(req.user.id, req.body, req.authSession);
  res.json({ user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const response = await requestPasswordReset(req.body);
  res.json(response);
});

export const postResetPassword = asyncHandler(async (req, res) => {
  const response = await resetPassword(req.body);
  res.json(response);
});

export const postVerifySiret = asyncHandler(async (req, res) => {
  const response = await previewSiretVerification(req.body?.siret);
  res.json(response);
});
