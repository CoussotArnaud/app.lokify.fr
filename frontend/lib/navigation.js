import { canAccessOperationalModules, isProvider, isSuperAdmin } from "./access";

const providerMainNavigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "DB",
    icon: "dashboard",
  },
  {
    href: "/reservations",
    label: "Reservations",
    shortLabel: "RS",
    icon: "calendar",
  },
  {
    href: "/clients",
    label: "Clients",
    shortLabel: "CL",
    icon: "users",
  },
  {
    href: "/catalogue",
    label: "Catalogue",
    shortLabel: "CT",
    icon: "catalog",
  },
  {
    href: "/toolbox",
    label: "Boite a outils",
    shortLabel: "BX",
    icon: "toolbox",
  },
  {
    href: "/statistiques",
    label: "Statistiques",
    shortLabel: "ST",
    icon: "chart",
  },
];

const superAdminMainNavigation = [
  {
    href: "/prestataires",
    label: "Prestataires",
    shortLabel: "PR",
    icon: "users",
  },
  {
    href: "/abonnements",
    label: "Abonnements",
    shortLabel: "AB",
    icon: "bill",
  },
  {
    href: "/parametres",
    label: "Parametres",
    shortLabel: "PM",
    icon: "settings",
  },
];

const providerQuickActionItems = [
  {
    id: "reservation",
    label: "Nouvelle reservation",
    href: "/reservations?mode=create",
    helper: "Creer une location et planifier la sortie.",
  },
  {
    id: "quote",
    label: "Nouveau devis",
    href: "/reservations?module=documents&mode=quote",
    helper: "Preparer une base commerciale avant validation.",
  },
  {
    id: "requests",
    label: "Demandes",
    href: "/dashboard?tab=reservations&focus=demandes",
    helper: "Revoir les demandes en attente de qualification.",
    badge: 3,
  },
];

const providerAccountMenuItems = [
  {
    id: "billing",
    label: "Facturation & abonnement",
    href: "/abonnement",
    icon: "bill",
  },
  {
    id: "storefront",
    label: "Boutique en ligne",
    href: "/boutique-en-ligne",
    icon: "shop",
  },
  {
    id: "invoices",
    label: "Factures",
    href: "/factures",
    icon: "bill",
  },
  {
    id: "settings",
    label: "Parametres",
    href: "/parametres",
    icon: "settings",
  },
];

const superAdminAccountMenuItems = [
  {
    id: "providers",
    label: "Prestataires",
    href: "/prestataires",
    icon: "users",
  },
  {
    id: "subscriptions",
    label: "Abonnements",
    href: "/abonnements",
    icon: "bill",
  },
  {
    id: "settings",
    label: "Parametres",
    href: "/parametres",
    icon: "settings",
  },
];

export const getMainNavigation = (user) =>
  isSuperAdmin(user) ? superAdminMainNavigation : providerMainNavigation;

export const getQuickActionItems = (user) =>
  isProvider(user) && canAccessOperationalModules(user) ? providerQuickActionItems : [];

export const getAccountMenuItems = (user) => {
  if (isSuperAdmin(user)) {
    return superAdminAccountMenuItems;
  }

  if (!isProvider(user)) {
    return [];
  }

  if (canAccessOperationalModules(user)) {
    return providerAccountMenuItems;
  }

  return providerAccountMenuItems.filter((item) => item.id === "billing" || item.id === "settings");
};
