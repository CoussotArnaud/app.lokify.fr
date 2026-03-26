import asyncHandler from "../utils/async-handler.js";
import {
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
