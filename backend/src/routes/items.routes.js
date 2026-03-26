import { Router } from "express";

import { getItems, postItem, putItem, removeItem } from "../controllers/items.controller.js";

const router = Router();

router.get("/", getItems);
router.post("/", postItem);
router.put("/:id", putItem);
router.delete("/:id", removeItem);

export default router;

