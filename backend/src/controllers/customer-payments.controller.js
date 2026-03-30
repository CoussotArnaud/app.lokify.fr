import asyncHandler from "../utils/async-handler.js";
import {
  createCustomerPaymentsConnectLink,
  disconnectCustomerPaymentsStripe,
  getCustomerPaymentSettings,
  updateCustomerPaymentSettings,
} from "../services/customer-payments.service.js";

export const getCustomerPaymentsSettings = asyncHandler(async (req, res) => {
  const settings = await getCustomerPaymentSettings(req.user.id);
  res.json(settings);
});

export const putCustomerPaymentsSettings = asyncHandler(async (req, res) => {
  const settings = await updateCustomerPaymentSettings(req.user.id, req.body);
  res.json(settings);
});

export const postCustomerPaymentsConnectLink = asyncHandler(async (req, res) => {
  const result = await createCustomerPaymentsConnectLink(req.user.id);
  res.status(201).json(result);
});

export const postCustomerPaymentsDisconnect = asyncHandler(async (req, res) => {
  const settings = await disconnectCustomerPaymentsStripe(req.user.id);
  res.json(settings);
});
