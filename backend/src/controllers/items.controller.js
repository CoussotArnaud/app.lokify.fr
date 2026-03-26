import asyncHandler from "../utils/async-handler.js";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
} from "../services/items.service.js";

export const getItems = asyncHandler(async (req, res) => {
  const items = await listItems(req.user.id);
  res.json({ items });
});

export const postItem = asyncHandler(async (req, res) => {
  const item = await createItem(req.user.id, req.body);
  res.status(201).json({ item });
});

export const putItem = asyncHandler(async (req, res) => {
  const item = await updateItem(req.user.id, req.params.id, req.body);
  res.json({ item });
});

export const removeItem = asyncHandler(async (req, res) => {
  await deleteItem(req.user.id, req.params.id);
  res.status(204).send();
});

