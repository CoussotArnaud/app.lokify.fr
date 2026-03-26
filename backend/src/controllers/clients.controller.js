import asyncHandler from "../utils/async-handler.js";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from "../services/clients.service.js";

export const getClients = asyncHandler(async (req, res) => {
  const clients = await listClients(req.user.id);
  res.json({ clients });
});

export const postClient = asyncHandler(async (req, res) => {
  const client = await createClient(req.user.id, req.body);
  res.status(201).json({ client });
});

export const putClient = asyncHandler(async (req, res) => {
  const client = await updateClient(req.user.id, req.params.id, req.body);
  res.json({ client });
});

export const removeClient = asyncHandler(async (req, res) => {
  await deleteClient(req.user.id, req.params.id);
  res.status(204).send();
});

