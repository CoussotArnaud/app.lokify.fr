import asyncHandler from "../utils/async-handler.js";
import { verifySiretWithSirene } from "../services/insee-sirene.service.js";

export const verifySiret = asyncHandler(async (req, res) => {
  const response = await verifySiretWithSirene(req.body?.siret);
  res.json(response);
});
