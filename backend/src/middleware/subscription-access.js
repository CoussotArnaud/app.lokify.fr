import HttpError from "../utils/http-error.js";

export const subscriptionAccessGuard = (req, _res, next) => {
  if (req.user?.permissions?.canAccessOperationalModules) {
    return next();
  }

  return next(
    new HttpError(
      403,
      "Abonnement Lokify requis pour acceder a ce module. Utilisez la zone Facturation & abonnement."
    )
  );
};
