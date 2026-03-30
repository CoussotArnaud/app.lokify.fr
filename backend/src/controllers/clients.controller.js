import asyncHandler from "../utils/async-handler.js";
import {
  archiveClient,
  createClient,
  deleteClient,
  getClientById,
  listClients,
  restoreClient,
  updateClient,
} from "../services/clients.service.js";
import {
  createClientDocument,
  deleteClientDocument,
  getClientDocument,
  listClientDocuments,
} from "../services/client-documents.service.js";

export const getClients = asyncHandler(async (req, res) => {
  const clients = await listClients(req.user.id, {
    scope: req.query.scope,
  });
  res.json({ clients });
});

export const getClientDetail = asyncHandler(async (req, res) => {
  const client = await getClientById(req.user.id, req.params.id);
  res.json({ client });
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
  await deleteClient(req.user.id, req.params.id, {
    actorUserId: req.user.id,
    archiveReason: req.body?.archive_reason ?? req.body?.archiveReason,
  });
  res.status(204).send();
});

export const archiveClientController = asyncHandler(async (req, res) => {
  const client = await archiveClient(req.user.id, req.params.id, {
    actorUserId: req.user.id,
    archiveReason: req.body?.archive_reason ?? req.body?.archiveReason,
  });
  res.json({ client });
});

export const restoreClientController = asyncHandler(async (req, res) => {
  const client = await restoreClient(req.user.id, req.params.id, {
    actorUserId: req.user.id,
    restoreReason: req.body?.restore_reason ?? req.body?.restoreReason,
  });
  res.json({ client });
});

export const getClientDocuments = asyncHandler(async (req, res) => {
  const documents = await listClientDocuments(req.user.id, req.params.id);
  res.json({ documents });
});

export const getClientDocumentDetail = asyncHandler(async (req, res) => {
  const document = await getClientDocument(req.user.id, req.params.id, req.params.documentId);
  res.json({ document });
});

export const postClientDocument = asyncHandler(async (req, res) => {
  const document = await createClientDocument(req.user.id, req.params.id, req.body);
  res.status(201).json({ document });
});

export const removeClientDocument = asyncHandler(async (req, res) => {
  await deleteClientDocument(req.user.id, req.params.id, req.params.documentId);
  res.status(204).send();
});
