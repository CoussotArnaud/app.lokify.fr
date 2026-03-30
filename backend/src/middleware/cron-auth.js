import env from "../config/env.js";
import HttpError from "../utils/http-error.js";

export const cronAuthMiddleware = (req, _res, next) => {
  if (!env.cronSecret) {
    return next(
      new HttpError(
        503,
        "CRON_SECRET est requis pour executer la maintenance d'archivage."
      )
    );
  }

  const authorization = String(req.headers.authorization || "").trim();

  if (authorization === `Bearer ${env.cronSecret}`) {
    return next();
  }

  return next(new HttpError(401, "Acces maintenance refuse."));
};
