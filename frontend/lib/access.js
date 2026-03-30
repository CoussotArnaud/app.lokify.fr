export const billingRoute = "/abonnement";
export const supportRoute = "/support";

const providerAlwaysAllowedRoutes = [billingRoute, supportRoute, "/parametres"];
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
const superAdminRoutes = ["/dashboard", "/prestataires", "/abonnements", supportRoute, "/parametres"];

const isSameOrNestedPath = (pathname, href) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const isSuperAdmin = (user) => user?.account_role === "super_admin";
export const isProvider = (user) => user?.account_role === "provider";

export const getWorkspaceUserLabel = (user, fallback = "Espace LOKIFY") => {
  if (isSuperAdmin(user)) {
    return "Super Admin";
  }

  const fullName = String(user?.full_name || "").trim();
  return fullName || fallback;
};

export const getWorkspaceUserAvatarLabel = (user, fallback = "LK") => {
  if (isSuperAdmin(user)) {
    return "SA";
  }

  const fullName = String(user?.full_name || "").trim();
  return fullName.slice(0, 2).toUpperCase() || fallback;
};

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
  isSuperAdmin(user) ? "/dashboard" : canAccessOperationalModules(user) ? "/dashboard" : billingRoute;
