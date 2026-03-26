export const billingRoute = "/abonnement";

const providerAlwaysAllowedRoutes = [billingRoute, "/parametres"];
const providerOperationalRoutes = [
  "/dashboard",
  "/reservations",
  "/clients",
  "/catalogue",
  "/toolbox",
  "/statistiques",
  "/planning",
  "/factures",
  "/boutique-en-ligne",
];
const superAdminRoutes = ["/prestataires", "/abonnements", "/parametres"];

const isSameOrNestedPath = (pathname, href) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const isSuperAdmin = (user) => user?.account_role === "super_admin";
export const isProvider = (user) => user?.account_role === "provider";

export const canAccessOperationalModules = (user) =>
  isProvider(user) && Boolean(user?.permissions?.canAccessOperationalModules);

export const getAccessRestriction = (pathname, user) => {
  if (!user) {
    return "auth";
  }

  if (isSuperAdmin(user)) {
    return superAdminRoutes.some((href) => isSameOrNestedPath(pathname, href)) ? null : "role";
  }

  if (isProvider(user)) {
    if (providerAlwaysAllowedRoutes.some((href) => isSameOrNestedPath(pathname, href))) {
      return null;
    }

    if (!providerOperationalRoutes.some((href) => isSameOrNestedPath(pathname, href))) {
      return "role";
    }

    return canAccessOperationalModules(user) ? null : "subscription";
  }

  return "role";
};

export const canAccessPath = (pathname, user) => getAccessRestriction(pathname, user) === null;

export const getWorkspaceHomePath = (user) =>
  isSuperAdmin(user) ? "/prestataires" : canAccessOperationalModules(user) ? "/dashboard" : billingRoute;
