export const mainNavigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "DB",
    icon: "dashboard",
  },
  {
    href: "/reservations",
    label: "Réservations",
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
    label: "Boîte à outils",
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

export const quickActionItems = [
  {
    id: "reservation",
    label: "Nouvelle réservation",
    href: "/reservations?mode=create",
    helper: "Créer une location et planifier la sortie.",
  },
  {
    id: "quote",
    label: "Nouveau devis",
    href: "/reservations?module=documents&mode=quote",
    helper: "Préparer une base commerciale avant validation.",
  },
  {
    id: "requests",
    label: "Demandes",
    href: "/dashboard?tab=reservations&focus=demandes",
    helper: "Revoir les demandes en attente de qualification.",
    badge: 3,
  },
];

export const accountMenuItems = [
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
    label: "Paramètres",
    href: "/parametres",
    icon: "settings",
  },
];

export const defaultReservationStatuses = [
  { code: "pending", label: "Non payé / En attente", color: "#D64F4F", position: 0, tone: "danger" },
  { code: "draft", label: "À finaliser", color: "#E39B2E", position: 1, tone: "warning" },
  { code: "confirmed", label: "Confirmé / Prêt", color: "#1C9C6B", position: 2, tone: "success" },
  { code: "completed", label: "Terminé", color: "#2F7DE1", position: 3, tone: "info" },
  { code: "cancelled", label: "Annulé", color: "#7A869A", position: 4, tone: "neutral" },
];

const defaultReservationStatusMetaByCode = defaultReservationStatuses.reduce((accumulator, status) => {
  accumulator[status.code] = {
    label: status.label,
    tone: status.tone,
    color: status.color,
    position: status.position,
  };
  return accumulator;
}, {});

export const buildReservationStatusMeta = (statuses = defaultReservationStatuses) =>
  statuses.reduce((accumulator, status) => {
    const fallback = defaultReservationStatusMetaByCode[status.code] || {
      tone: "neutral",
      color: "#7A869A",
      position: 99,
    };

    accumulator[status.code] = {
      label: status.label || fallback.label || status.code,
      tone: status.tone || fallback.tone,
      color: status.color || fallback.color,
      position: status.position ?? fallback.position,
    };
    return accumulator;
  }, {});

export const reservationStatusMeta = buildReservationStatusMeta();

export const reservationDepositStatusMeta = {
  not_required: {
    label: "Aucune caution",
    tone: "neutral",
    color: "#7A869A",
  },
  pending: {
    label: "À récupérer",
    tone: "warning",
    color: "#E39B2E",
  },
  collected: {
    label: "Récupérée",
    tone: "success",
    color: "#1C9C6B",
  },
  released: {
    label: "Restituée",
    tone: "info",
    color: "#2F7DE1",
  },
  waived: {
    label: "Abandonnée",
    tone: "danger",
    color: "#D64F4F",
  },
};

export const productStatusMeta = {
  available: {
    label: "Disponible",
    tone: "success",
  },
  reserved: {
    label: "Réservé",
    tone: "warning",
  },
  maintenance: {
    label: "Maintenance",
    tone: "neutral",
  },
  unavailable: {
    label: "Indisponible",
    tone: "danger",
  },
  inactive: {
    label: "Désactivé",
    tone: "neutral",
  },
};

export const productUnitStatusMeta = {
  available: {
    label: "Disponible",
    tone: "success",
    color: "#1C9C6B",
  },
  out: {
    label: "Sortie",
    tone: "warning",
    color: "#E39B2E",
  },
  maintenance: {
    label: "Maintenance",
    tone: "neutral",
    color: "#7A869A",
  },
  unavailable: {
    label: "Indisponible",
    tone: "danger",
    color: "#D64F4F",
  },
};

export const stockMovementMeta = {
  unit_created: {
    label: "Création unité",
    tone: "info",
  },
  availability_change: {
    label: "Changement statut",
    tone: "warning",
  },
  departure: {
    label: "Départ",
    tone: "success",
  },
  return: {
    label: "Retour",
    tone: "info",
  },
};

export const deliveryTourStatusMeta = {
  draft: {
    label: "À préparer",
    tone: "warning",
  },
  planned: {
    label: "Planifiée",
    tone: "success",
  },
  in_progress: {
    label: "En cours",
    tone: "info",
  },
  completed: {
    label: "Terminée",
    tone: "neutral",
  },
};

export const deliveryAssignmentMeta = {
  delivery: {
    label: "Livraison",
    tone: "success",
  },
  return: {
    label: "Retour",
    tone: "info",
  },
  pickup: {
    label: "Enlèvement",
    tone: "warning",
  },
};

export const dashboardTabs = [
  { id: "reservations", label: "Réservations" },
  { id: "deliveries", label: "Livraisons" },
  { id: "stock", label: "Stock" },
];

export const dashboardDisplayModes = [
  { id: "calendar", label: "Calendrier" },
  { id: "list", label: "Liste" },
  { id: "day", label: "Ma journée" },
];

export const dashboardHorizonModes = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
];

export const reservationSubNavigation = [
  { id: "reservations", label: "Réservations" },
  { id: "documents", label: "Documents" },
  { id: "cash", label: "Journal de caisse" },
];

export const catalogueViews = [
  { id: "all", label: "Tous les produits" },
  { id: "categories", label: "Catégories" },
  { id: "packs", label: "Packs" },
  { id: "products", label: "Produits" },
];

export const statisticsNavigation = [
  { id: "overview", label: "Vue globale" },
  { id: "revenue", label: "CA par jour" },
  { id: "channels", label: "Canaux" },
  { id: "categories", label: "Catégories" },
  { id: "reservations", label: "Réservations" },
  { id: "deliveries", label: "Livraisons" },
  { id: "bestsellers", label: "Best sellers" },
  { id: "online", label: "Boutique" },
  { id: "clients", label: "Clients" },
  { id: "promotions", label: "Codes promo" },
];

export const toolboxTabs = [
  { id: "all", label: "Tous les outils" },
  { id: "new", label: "Nouveautés" },
  { id: "soon", label: "Bientôt disponible" },
  { id: "mine", label: "Mes outils" },
];

export const categoryBlueprints = [
  {
    id: "animation-photo",
    name: "Animation photo",
    type: "Événementiel",
    description: "Bornes, expériences selfie et activations photo pour mariages, salons et lancements.",
    filters: ["format", "impression", "branding"],
    inspectionEnabled: true,
    durations: [
      { label: "Express", hours: 4 },
      { label: "Journée", hours: 10 },
      { label: "Week-end", hours: 48 },
    ],
    ranges: [
      { label: "Soirée", minHours: 6, maxHours: 12 },
      { label: "Activation longue", minHours: 24, maxHours: 72 },
    ],
    status: "active",
  },
  {
    id: "video-scene",
    name: "Video & scene",
    type: "Experience premium",
    description: "Video booths, capsules et expériences de scène pour événements immersifs.",
    filters: ["captation", "rotation", "livraison"],
    inspectionEnabled: true,
    durations: [
      { label: "Session", hours: 6 },
      { label: "Journée scène", hours: 12 },
    ],
    ranges: [
      { label: "Production", minHours: 12, maxHours: 36 },
    ],
    status: "active",
  },
  {
    id: "mobilite-evenementielle",
    name: "Mobilité événementielle",
    type: "Mobilité",
    description: "Trottinettes, solutions de déplacement et matériel pour circulation sur site.",
    filters: ["autonomie", "zone", "assurance"],
    inspectionEnabled: false,
    durations: [
      { label: "Demi-journée", hours: 5 },
      { label: "Journée", hours: 10 },
      { label: "Semaine", hours: 120 },
    ],
    ranges: [
      { label: "Longue durée", minHours: 72, maxHours: 240 },
    ],
    status: "active",
  },
  {
    id: "pack-agence",
    name: "Pack agence",
    type: "Offre composée",
    description: "Compositions rapides pour prestations récurrentes, roadshows et activations marques.",
    filters: ["branding", "transport", "staffing"],
    inspectionEnabled: true,
    durations: [
      { label: "Activation", hours: 8 },
      { label: "Roadshow", hours: 72 },
    ],
    ranges: [
      { label: "Circuit multijours", minHours: 48, maxHours: 120 },
    ],
    status: "draft",
  },
];

export const packBlueprints = [
  {
    id: "pack-soiree-signature",
    name: "Pack Soirée Signature",
    summary: "Une formule simple pour événement privé avec animation photo et accessoires.",
    categoryId: "animation-photo",
    productHints: ["Photobooth Premium"],
    status: "active",
    priceFrom: 690,
  },
  {
    id: "pack-lancement-marque",
    name: "Pack Lancement Marque",
    summary: "Setup d'activation premium pour salons, lancements et pop-up stores.",
    categoryId: "video-scene",
    productHints: ["Videobooth 360", "Photobooth Premium"],
    status: "active",
    priceFrom: 1290,
  },
  {
    id: "pack-circulation-site",
    name: "Pack Circulation Site",
    summary: "Mobilité staff et logistique légère sur grands espaces ou tournages.",
    categoryId: "mobilite-evenementielle",
    productHints: ["Trottinette Électrique"],
    status: "inactive",
    priceFrom: 420,
  },
];

export const deliveryTemplates = [
  {
    id: "tournee-matin",
    name: "Tournée matin",
    driver: "Équipe logistique A",
    area: "Paris centre",
    dayOffset: 1,
    status: "planned",
    stops: [
      { label: "Chargement dépôt", slot: "07:30", kind: "depot" },
      { label: "Installation client", slot: "09:15", kind: "delivery" },
      { label: "Contrôle terrain", slot: "11:00", kind: "check" },
    ],
  },
  {
    id: "tournee-apres-midi",
    name: "Tournée après-midi",
    driver: "Équipe logistique B",
    area: "Lyon métropole",
    dayOffset: 2,
    status: "draft",
    stops: [
      { label: "Préparation du matériel", slot: "12:30", kind: "depot" },
      { label: "Livraison premium", slot: "15:00", kind: "delivery" },
      { label: "Récupération retour", slot: "18:15", kind: "pickup" },
    ],
  },
];

export const toolboxModules = [
  {
    id: "payments-hub",
    title: "Paiements",
    description: "Activez des encaissements plus fluides pour acomptes, soldes et cautions.",
    category: "Finance",
    accent: "forest",
    isNew: true,
    isComingSoon: false,
    enabledByDefault: true,
  },
  {
    id: "review-collector",
    title: "Avis clients",
    description: "Centralisez la collecte d'avis post-événement pour rassurer et convertir.",
    category: "Marketing",
    accent: "sun",
    isNew: true,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "insurance-module",
    title: "Assurance",
    description: "Structurez les garanties, franchises et justificatifs liés à vos locations.",
    category: "Protection",
    accent: "lagoon",
    isNew: false,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "holiday-vouchers",
    title: "Chèques vacances",
    description: "Préparez une activation pour accepter des moyens de paiement complémentaires.",
    category: "Paiement",
    accent: "ink",
    isNew: false,
    isComingSoon: true,
    enabledByDefault: false,
  },
  {
    id: "deposit-guarantee",
    title: "Dépôt & caution",
    description: "Suivez les cautions, restitutions et justificatifs sans multiplier les outils.",
    category: "Opérations",
    accent: "rose",
    isNew: false,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "future-addons",
    title: "Modules complémentaires",
    description: "Ajoutez d'autres modules selon l'évolution de votre activité.",
    category: "Extensions",
    accent: "amber",
    isNew: false,
    isComingSoon: true,
    enabledByDefault: false,
  },
];

export const promotionExamples = [
  {
    code: "LANCEMENT10",
    label: "Offre lancement",
    uses: 6,
    revenue: 840,
  },
  {
    code: "PACKPRO",
    label: "Pack agence",
    uses: 3,
    revenue: 1460,
  },
];

export const salesChannelExamples = [
  {
    id: "direct",
    label: "Contact direct",
    share: 46,
  },
  {
    id: "partners",
    label: "Partenaires",
    share: 24,
  },
  {
    id: "website",
    label: "Boutique en ligne",
    share: 18,
  },
  {
    id: "referral",
    label: "Recommandations",
    share: 12,
  },
];

export const onlineActivityExamples = [
  {
    label: "Demandes web",
    value: 14,
  },
  {
    label: "Conversion panier",
    value: 31,
  },
  {
    label: "Messages entrants",
    value: 9,
  },
];
