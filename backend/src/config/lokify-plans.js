export const lokifyPlanCatalog = [
  {
    id: "essential",
    name: "Essentiel",
    price: 29,
    unitAmount: 2900,
    currency: "eur",
    interval: "month",
    description: "La base LOKIFY pour lancer un espace prestataire et piloter les operations courantes.",
    highlights: [
      "Dashboard et suivi des reservations",
      "Catalogue et clients centralises",
      "Acces au module abonnement Lokify",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 59,
    unitAmount: 5900,
    currency: "eur",
    interval: "month",
    description: "Une formule plus complete pour les prestataires qui veulent structurer le pilotage au quotidien.",
    highlights: [
      "Tous les elements Essentiel",
      "Pilotage avance des operations",
      "Base preparee pour les futures integrations",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 99,
    unitAmount: 9900,
    currency: "eur",
    interval: "month",
    description: "Une formule de test plus premium pour valider les parcours, sans figer la politique commerciale finale.",
    highlights: [
      "Tous les elements Pro",
      "Parcours de souscription test complet",
      "Preparation aux futurs webhooks et evolutions SaaS",
    ],
  },
];

export const getLokifyPlanById = (planId) =>
  lokifyPlanCatalog.find((plan) => plan.id === String(planId || "").trim().toLowerCase()) || null;
