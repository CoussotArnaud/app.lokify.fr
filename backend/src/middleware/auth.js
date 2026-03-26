import jwt from "jsonwebtoken";

import env from "../config/env.js";
import { getUserAccountProfile } from "../services/account-profile.service.js";
import HttpError from "../utils/http-error.js";

export const authMiddleware = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      throw new HttpError(401, "Authentification requise.");
    }

    const token = authorization.slice(7);
    const payload = jwt.verify(token, env.jwtSecret);
    req.authSession = {
      sessionProfile: payload.sessionProfile || "standard",
      displayEmail: payload.displayEmail || null,
    };
    req.user = await getUserAccountProfile(payload.sub, req.authSession);
    next();
  } catch (error) {
    if (error.statusCode === 404) {
      return next(new HttpError(401, "Session invalide."));
    }

    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new HttpError(401, "Session expiree ou invalide."));
    }

    return next(error);
  }
};
