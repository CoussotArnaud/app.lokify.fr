import HttpError from "../utils/http-error.js";

export const requireRole =
  (...allowedRoles) =>
  (req, _res, next) => {
    const currentRole = req.user?.account_role;

    if (allowedRoles.includes(currentRole)) {
      return next();
    }

    return next(new HttpError(403, "Acces refuse pour ce role."));
  };

export const requireSuperAdmin = requireRole("super_admin");
export const requireProviderRole = requireRole("provider");
