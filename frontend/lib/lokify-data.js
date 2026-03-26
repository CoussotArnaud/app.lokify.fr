export const mainNavigation = [
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

export const quickActionItems = [
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
    label: "Parametres",
    href: "/parametres",
    icon: "settings",
  },
];

export const reservationStatusMeta = {
  draft: {
    label: "Brouillon",
    tone: "warning",
  },
  confirmed: {
    label: "Confirmee",
    tone: "success",
  },
  completed: {
    label: "Terminee",
    tone: "info",
  },
  cancelled: {
    label: "Annulee",
    tone: "danger",
  },
  pending: {
    label: "A valider",
    tone: "warning",
  },
};

export const productStatusMeta = {
  available: {
    label: "Disponible",
    tone: "success",
  },
  reserved: {
    label: "Reserve",
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
    label: "Desactive",
    tone: "neutral",
  },
};

export const dashboardTabs = [
  { id: "reservations", label: "Reservations" },
  { id: "deliveries", label: "Livraisons" },
  { id: "stock", label: "Stock" },
];

export const dashboardDisplayModes = [
  { id: "calendar", label: "Calendrier" },
  { id: "list", label: "Liste" },
  { id: "day", label: "Ma journee" },
];

export const dashboardHorizonModes = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
];

export const reservationSubNavigation = [
  { id: "reservations", label: "Reservations" },
  { id: "documents", label: "Documents" },
  { id: "cash", label: "Journal de caisse" },
];

export const catalogueViews = [
  { id: "all", label: "Tous les produits" },
  { id: "categories", label: "Categories" },
  { id: "packs", label: "Packs" },
  { id: "products", label: "Produits" },
];

export const statisticsNavigation = [
  { id: "overview", label: "Vue globale" },
  { id: "revenue", label: "CA par jour" },
  { id: "channels", label: "Canaux" },
  { id: "categories", label: "Categories" },
  { id: "reservations", label: "Reservations" },
  { id: "deliveries", label: "Livraisons" },
  { id: "bestsellers", label: "Best sellers" },
  { id: "online", label: "Boutique" },
  { id: "clients", label: "Clients" },
  { id: "promotions", label: "Codes promo" },
];

export const toolboxTabs = [
  { id: "all", label: "Tous les outils" },
  { id: "new", label: "Nouveautes" },
  { id: "soon", label: "Bientot disponible" },
  { id: "mine", label: "Mes outils" },
];

export const categoryBlueprints = [
  {
    id: "animation-photo",
    name: "Animation photo",
    type: "Evenementiel",
    description: "Bornes, experiences selfie et activations photo pour mariages, salons et lancements.",
    filters: ["format", "impression", "branding"],
    inspectionEnabled: true,
    durations: [
      { label: "Express", hours: 4 },
      { label: "Journee", hours: 10 },
      { label: "Week-end", hours: 48 },
    ],
    ranges: [
      { label: "Soiree", minHours: 6, maxHours: 12 },
      { label: "Activation longue", minHours: 24, maxHours: 72 },
    ],
    status: "active",
  },
  {
    id: "video-scene",
    name: "Video & scene",
    type: "Experience premium",
    description: "Video booths, capsules et experiences de scene pour evenements immersifs.",
    filters: ["captation", "rotation", "livraison"],
    inspectionEnabled: true,
    durations: [
      { label: "Session", hours: 6 },
      { label: "Journee scene", hours: 12 },
    ],
    ranges: [
      { label: "Production", minHours: 12, maxHours: 36 },
    ],
    status: "active",
  },
  {
    id: "mobilite-evenementielle",
    name: "Mobilite evenementielle",
    type: "Mobilite",
    description: "Trottinettes, solutions de deplacement et materiel pour circulation sur site.",
    filters: ["autonomie", "zone", "assurance"],
    inspectionEnabled: false,
    durations: [
      { label: "Demi-journee", hours: 5 },
      { label: "Journee", hours: 10 },
      { label: "Semaine", hours: 120 },
    ],
    ranges: [
      { label: "Longue duree", minHours: 72, maxHours: 240 },
    ],
    status: "active",
  },
  {
    id: "pack-agence",
    name: "Pack agence",
    type: "Offre composee",
    description: "Compositions rapides pour prestations recurrentes, roadshows et activations marques.",
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
    name: "Pack Soiree Signature",
    summary: "Une formule simple pour evenement prive avec animation photo et accessoires.",
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
    summary: "Mobilite staff et logistique legere sur grands espaces ou tournages.",
    categoryId: "mobilite-evenementielle",
    productHints: ["Trottinette Electrique"],
    status: "inactive",
    priceFrom: 420,
  },
];

export const deliveryTemplates = [
  {
    id: "tournee-matin",
    name: "Tournee matin",
    driver: "Equipe logistique A",
    area: "Paris centre",
    dayOffset: 1,
    status: "planned",
    stops: [
      { label: "Chargement depot", slot: "07:30", kind: "depot" },
      { label: "Installation client", slot: "09:15", kind: "delivery" },
      { label: "Controle terrain", slot: "11:00", kind: "check" },
    ],
  },
  {
    id: "tournee-apres-midi",
    name: "Tournee apres-midi",
    driver: "Equipe logistique B",
    area: "Lyon metropole",
    dayOffset: 2,
    status: "draft",
    stops: [
      { label: "Preparation du materiel", slot: "12:30", kind: "depot" },
      { label: "Livraison premium", slot: "15:00", kind: "delivery" },
      { label: "Recuperation retour", slot: "18:15", kind: "pickup" },
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
    description: "Centralisez la collecte d'avis post-evenement pour rassurer et convertir.",
    category: "Marketing",
    accent: "sun",
    isNew: true,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "insurance-module",
    title: "Assurance",
    description: "Structurez les garanties, franchises et justificatifs lies a vos locations.",
    category: "Protection",
    accent: "lagoon",
    isNew: false,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "holiday-vouchers",
    title: "Cheques vacances",
    description: "Preparez une activation pour accepter des moyens de paiement complementaires.",
    category: "Paiement",
    accent: "ink",
    isNew: false,
    isComingSoon: true,
    enabledByDefault: false,
  },
  {
    id: "deposit-guarantee",
    title: "Depot & caution",
    description: "Suivez les cautions, restitutions et justificatifs sans multiplier les outils.",
    category: "Operations",
    accent: "rose",
    isNew: false,
    isComingSoon: false,
    enabledByDefault: false,
  },
  {
    id: "future-addons",
    title: "Futurs modules",
    description: "Gardez une base propre pour accueillir d'autres briques SaaS sans effet marketplace.",
    category: "Roadmap",
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
