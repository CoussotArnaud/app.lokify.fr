export const lokifyPlanCatalog = [
  {
    id: "essential",
    name: "Basique",
    price: 29,
    unitAmount: 2900,
    currency: "eur",
    interval: "month",
    description: "La formule de base pour demarrer sur Lokify et gerer l'activite quotidienne.",
    highlights: [
      "Dashboard, reservations et clients",
      "Catalogue et planning quotidien",
      "Gestion simple et efficace au quotidien",
    ],
  },
  {
    id: "pro",
    name: "Intermediaire",
    price: 59,
    unitAmount: 5900,
    currency: "eur",
    interval: "month",
    description: "Une formule plus complete pour structurer l'exploitation et le pilotage au quotidien.",
    highlights: [
      "Tous les elements de la formule Basique",
      "Suivi d'exploitation plus avance",
      "Outils renforces pour piloter votre activite",
    ],
  },
  {
    id: "premium",
    name: "Avancee",
    price: 99,
    unitAmount: 9900,
    currency: "eur",
    interval: "month",
    description: "La formule la plus complete pour accompagner les structures en croissance.",
    highlights: [
      "Tous les elements de la formule Intermediaire",
      "Configuration paiement avancee",
      "Outils complets pour les besoins etendus",
    ],
  },
];

export const getLokifyPlanById = (planId) =>
  lokifyPlanCatalog.find((plan) => plan.id === String(planId || "").trim().toLowerCase()) || null;
