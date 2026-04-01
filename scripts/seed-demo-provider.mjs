import crypto from "crypto";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFilePath);
const workspaceRoot = path.resolve(scriptsDir, "..");
const backendRequire = createRequire(path.join(workspaceRoot, "backend", "package.json"));
const bcrypt = backendRequire("bcryptjs");
const dotenv = backendRequire("dotenv");

const parseArgs = (argv = []) => {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--env-file") {
      options.envFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--email") {
      options.email = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--password") {
      options.password = argv[index + 1];
      index += 1;
    }
  }

  return options;
};

const options = parseArgs(process.argv.slice(2));
const envFilePath = path.resolve(workspaceRoot, options.envFile || "backend/.env");
dotenv.config({
  path: envFilePath,
  override: true,
});

const [{ pool, query }, { ensureUserSettingsRecords }, { ensureStorefrontSettingsRecord }, { upsertCatalogCategory, createCatalogProduct, createCatalogPack }, { createClient }, { createReservation }] =
  await Promise.all([
    import("../backend/src/config/db.js"),
    import("../backend/src/services/account-profile.service.js"),
    import("../backend/src/services/storefront.service.js"),
    import("../backend/src/services/catalog.service.js"),
    import("../backend/src/services/clients.service.js"),
    import("../backend/src/services/reservations.service.js"),
  ]);

const DEMO_EMAIL = String(options.email || "presta@lokify.fr").trim().toLowerCase();
const DEMO_PASSWORD = String(options.password || "presta");
const DEMO_BASE_SLUG = "demo-lokify-events";
const DEMO_MEDIA = {
  photobooth:
    "https://images.unsplash.com/photo-1742991106935-eaec5df86ae1?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
  phone:
    "https://images.unsplash.com/photo-1746016988321-cfb6bfd1114a?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
  balloons:
    "https://images.unsplash.com/photo-1768725845575-e4767b85b151?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
  cocktail:
    "https://images.unsplash.com/photo-1752992973821-509319362341?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
  chairs:
    "https://images.unsplash.com/photo-1754008354678-0c9fcfd96300?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
  candy:
    "https://images.unsplash.com/photo-1767396867485-7e41ee6fec97?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=80&w=1600",
};

const buildSvgDataUri = ({
  title,
  subtitle,
  accent = "#a337ca",
  accentSoft = "#069de4",
  background = "#f5f7ff",
}) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="55%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#eef7ff" />
        </linearGradient>
        <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.92" />
          <stop offset="100%" stop-color="${accentSoft}" stop-opacity="0.92" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" rx="56" fill="url(#bg)" />
      <circle cx="180" cy="170" r="150" fill="${accent}" opacity="0.10" />
      <circle cx="990" cy="160" r="120" fill="${accentSoft}" opacity="0.10" />
      <rect x="110" y="160" width="980" height="580" rx="44" fill="#ffffff" />
      <rect x="170" y="220" width="390" height="460" rx="34" fill="url(#card)" />
      <rect x="620" y="240" width="360" height="44" rx="22" fill="${accent}" opacity="0.14" />
      <rect x="620" y="318" width="300" height="26" rx="13" fill="#d6deed" />
      <rect x="620" y="370" width="260" height="26" rx="13" fill="#d6deed" />
      <rect x="620" y="422" width="320" height="26" rx="13" fill="#d6deed" />
      <rect x="620" y="520" width="198" height="68" rx="34" fill="${accent}" />
      <text x="620" y="560" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">Demande</text>
      <text x="620" y="666" font-family="Arial, sans-serif" font-size="68" font-weight="800" fill="#172238">${title}</text>
      <text x="620" y="724" font-family="Arial, sans-serif" font-size="28" fill="#5d6778">${subtitle}</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

const categoryFixtures = [
  ["photobooths", "Photobooths", "Bornes photo, miroirs et experiences selfie pour les evenements."],
  ["mobilier", "Mobilier", "Assises, bars et modules pour structurer un espace reception."],
  ["jeux-animations", "Jeux & animations", "Experiences ludiques pour rythmer les temps forts."],
  ["accessoires", "Accessoires", "Petits plus visuels et memorables pour enrichir l'evenement."],
  ["packs-evenements", "Packs evenements", "Selections prêtes a reserver pour aller plus vite."],
];

const categoryImageBySlug = {
  photobooths: DEMO_MEDIA.photobooth,
  mobilier: DEMO_MEDIA.chairs,
  "jeux-animations": DEMO_MEDIA.candy,
  accessoires: DEMO_MEDIA.phone,
  "packs-evenements": DEMO_MEDIA.balloons,
};

const productFixtures = [
  {
    key: "aura",
    name: "Borne Photo Aura",
    category: "photobooths",
    stock: 2,
    price: 349,
    deposit: 900,
    featured: true,
    copy: "Borne photo premium avec eclairage studio et partage instantane.",
    options: [{ name: "Livraison + installation", price: 90 }, { name: "Fond personnalise", price: 79 }],
    photos: [DEMO_MEDIA.photobooth, DEMO_MEDIA.balloons],
  },
  {
    key: "selfie-box",
    name: "Selfie Box Classique",
    category: "photobooths",
    stock: 3,
    price: 229,
    deposit: 500,
    featured: true,
    copy: "Selfie box simple a prendre en main pour anniversaires et receptions.",
    options: [{ name: "Impressions illimitees", price: 49 }],
    photos: [DEMO_MEDIA.photobooth, DEMO_MEDIA.cocktail],
  },
  {
    key: "miroir",
    name: "Miroir Flash Signature",
    category: "photobooths",
    stock: 1,
    price: 429,
    deposit: 950,
    featured: true,
    copy: "Miroir photo interactif pour un rendu plus scenographique.",
    photos: [DEMO_MEDIA.balloons, DEMO_MEDIA.photobooth],
  },
  {
    key: "mange-debout",
    name: "Mange-debout Lino",
    category: "mobilier",
    stock: 12,
    price: 18,
    deposit: 40,
    copy: "Mange-debout sobre et stable pour cocktail, vin d'honneur ou salon.",
    photos: [DEMO_MEDIA.cocktail, DEMO_MEDIA.chairs],
  },
  {
    key: "lounge",
    name: "Lounge Palette Bois",
    category: "mobilier",
    stock: 4,
    price: 65,
    deposit: 120,
    copy: "Salon palette avec coussins clairs pour coin detente chic et decontracte.",
    photos: [DEMO_MEDIA.chairs, DEMO_MEDIA.cocktail],
  },
  {
    key: "bar-limonade",
    name: "Bar a limonade",
    category: "mobilier",
    stock: 2,
    price: 120,
    deposit: 180,
    copy: "Comptoir mobile pour candy bar, coin boisson ou buffet dessert.",
    photos: [DEMO_MEDIA.cocktail, DEMO_MEDIA.candy],
  },
  {
    key: "barbe-a-papa",
    name: "Machine Barbe a Papa",
    category: "jeux-animations",
    stock: 2,
    price: 95,
    deposit: 140,
    featured: true,
    copy: "Animation gourmande ideale pour anniversaires et family day.",
    photos: [DEMO_MEDIA.candy, DEMO_MEDIA.balloons],
  },
  {
    key: "connect4",
    name: "Jeu geant Connect 4",
    category: "jeux-animations",
    stock: 2,
    price: 55,
    deposit: 100,
    copy: "Jeu geant facile a installer pour animer les temps creux.",
    photos: [DEMO_MEDIA.balloons, DEMO_MEDIA.candy],
  },
  {
    key: "livre-audio",
    name: "Livre d'or Audio Satin",
    category: "accessoires",
    stock: 1,
    price: 89,
    deposit: 120,
    featured: true,
    copy: "Telephone audio pour laisser des messages vocaux memorables.",
    options: [{ name: "Montage souvenir", price: 39 }],
    photos: [DEMO_MEDIA.phone, DEMO_MEDIA.chairs],
  },
  {
    key: "arche-ballons",
    name: "Arche a ballons Signature",
    category: "accessoires",
    stock: 2,
    price: 140,
    deposit: 80,
    copy: "Arche de bienvenue elegante pour entree, candy bar ou photocall.",
    photos: [DEMO_MEDIA.balloons, DEMO_MEDIA.cocktail],
  },
  {
    key: "mur-selfie",
    name: "Mur selfie neon",
    category: "packs-evenements",
    stock: 1,
    price: 179,
    deposit: 250,
    featured: true,
    copy: "Mur visuel avec neon pour creer un point photo tres visible.",
    photos: [DEMO_MEDIA.photobooth, DEMO_MEDIA.balloons],
  },
  {
    key: "pack-deco",
    name: "Pack deco mariage",
    category: "packs-evenements",
    stock: 1,
    price: 260,
    deposit: 180,
    copy: "Selection deco prete a reserver pour habiller l'espace reception.",
    photos: [DEMO_MEDIA.chairs, DEMO_MEDIA.balloons],
  },
];

const createOrUpdateDemoProvider = async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existingUser = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", [DEMO_EMAIL]);

  if (existingUser.rows[0]) {
    await query(
      `UPDATE users
       SET full_name = $2,
           company_name = $3,
           commercial_name = $4,
           password_hash = $5,
           provider_status = 'active',
           first_name = 'Equipe',
           last_name = 'Demo',
           phone = '0600000000',
           country = 'France',
           address = '12 quai des evenements',
           postal_code = '44000',
           city = 'Nantes',
           archived_at = NULL,
           archived_by = NULL,
           archive_reason = NULL,
           scheduled_purge_at = NULL
       WHERE id = $1`,
      [existingUser.rows[0].id, "Lokify Demo Events", "Lokify Demo Events", "Lokify Demo Events", passwordHash]
    );

    return existingUser.rows[0].id;
  }

  const providerId = crypto.randomUUID();
  await query(
    `INSERT INTO users (
      id, full_name, company_name, commercial_name, email, password_hash, account_role, provider_status,
      first_name, last_name, phone, country, address, postal_code, city
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'provider', 'active',
      'Equipe', 'Demo', '0600000000', 'France', '12 quai des evenements', '44000', 'Nantes'
    )`,
    [providerId, "Lokify Demo Events", "Lokify Demo Events", "Lokify Demo Events", DEMO_EMAIL, passwordHash]
  );

  return providerId;
};

const resolveAvailableSlug = async (baseSlug, userId) => {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const existing = await query("SELECT user_id FROM storefront_settings WHERE slug = $1 LIMIT 1", [candidate]);
    if (!existing.rows[0] || existing.rows[0].user_id === userId) {
      return candidate;
    }
  }
  return `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
};

const prepareProviderWorkspace = async (providerId) => {
  await ensureUserSettingsRecords(providerId);
  await ensureStorefrontSettingsRecord(providerId);

  const slug = await resolveAvailableSlug(DEMO_BASE_SLUG, providerId);
  await query(
    `UPDATE storefront_settings
     SET slug = $2,
         is_published = TRUE,
         reservation_approval_mode = 'manual',
         map_enabled = TRUE,
         map_address = '12 quai des evenements, 44000 Nantes',
         reviews_enabled = TRUE,
         reviews_url = 'https://www.google.com/search?q=lokify+demo+events+avis'
     WHERE user_id = $1`,
    [providerId, slug]
  );

  await query(
    `UPDATE lokify_billing_settings
     SET lokify_plan_id = 'pro',
         lokify_plan_name = 'Intermediaire',
         lokify_plan_price = 59,
         lokify_plan_interval = 'month',
         lokify_subscription_status = 'active',
         subscription_locked = FALSE,
         access_restricted_by_subscription = FALSE
     WHERE user_id = $1`,
    [providerId]
  );

  await query(
    `UPDATE customer_payment_settings
     SET customer_payments_enabled = FALSE,
         customer_stripe_mode = 'test',
         customer_stripe_account_status = 'ready',
         customer_payment_status = 'paid',
         customer_payment_method_label = 'Mode demonstration'
     WHERE user_id = $1`,
    [providerId]
  );

  return slug;
};

const clearDemoData = async (providerId) => {
  const deleteStatements = [
    "DELETE FROM reservation_deposits WHERE user_id = $1",
    "DELETE FROM reservation_lines WHERE user_id = $1",
    "DELETE FROM delivery_assignments WHERE user_id = $1",
    "DELETE FROM delivery_stops WHERE user_id = $1",
    "DELETE FROM delivery_tours WHERE user_id = $1",
    "DELETE FROM reservations WHERE user_id = $1",
    "DELETE FROM product_units WHERE user_id = $1",
    "DELETE FROM catalog_pack_products WHERE user_id = $1",
    "DELETE FROM catalog_packs WHERE user_id = $1",
    "DELETE FROM item_profiles WHERE user_id = $1",
    "DELETE FROM catalog_categories WHERE user_id = $1",
    "DELETE FROM clients WHERE user_id = $1",
    "DELETE FROM items WHERE user_id = $1",
  ];

  for (const statement of deleteStatements) {
    await query(statement, [providerId]);
  }
};

const createCategories = async (providerId) => {
  for (const [slug, name, description] of categoryFixtures) {
    const image =
      categoryImageBySlug[slug] ||
      buildSvgDataUri({
        title: name,
        subtitle: "Collection demo",
      });

    await upsertCatalogCategory(providerId, {
      slug,
      name,
      description,
      image_url: image,
      image_alt_text: name,
      images: [{ url: image, kind: "thumbnail", alt_text: name }],
    });
  }
};

const createProducts = async (providerId) => {
  const productsByKey = {};

  for (const fixture of productFixtures) {
    const imageOne =
      fixture.photos?.[0] ||
      buildSvgDataUri({ title: fixture.name, subtitle: "Demo storefront" });
    const imageTwo =
      fixture.photos?.[1] ||
      buildSvgDataUri({
        title: fixture.name,
        subtitle: "Vue detail",
        accent: "#3e1579",
        accentSoft: "#2f9cdf",
        background: "#f7f2ff",
      });

    const created = await createCatalogProduct(providerId, {
      item: {
        name: fixture.name,
        category: fixture.category,
        stock: fixture.stock,
        status: "available",
        price: fixture.price,
        deposit: fixture.deposit,
      },
      profile: {
        category_slug: fixture.category,
        category_name: categoryFixtures.find(([slug]) => slug === fixture.category)?.[1] || fixture.category,
        online_visible: true,
        is_featured: Boolean(fixture.featured),
        public_name: fixture.name,
        public_description: fixture.copy,
        long_description: `${fixture.copy} Cette fiche de demonstration permet de tester les cartes, la galerie produit, le panier et le recalcul des disponibilites.`,
        catalog_mode: "location",
        sku: `DEMO-${fixture.key.toUpperCase()}`,
        photos: [imageOne, imageTwo],
        options: fixture.options || [],
      },
    });

    productsByKey[fixture.key] = created.item.id;
  }

  return productsByKey;
};

const createPacks = async (providerId, productsByKey) => {
  await createCatalogPack(providerId, {
    name: "Pack Mariage Signature",
    description: "Photobooth, livre d'or audio et decor photo dans une seule reservation.",
    discount_type: "percentage",
    discount_value: 12,
    product_ids: [
      productsByKey.aura,
      productsByKey["livre-audio"],
      productsByKey["arche-ballons"],
      productsByKey.lounge,
    ],
  });

  await createCatalogPack(providerId, {
    name: "Pack Anniversaire Festif",
    description: "Selfie box, animation gourmande et jeu geant pour un format cle en main.",
    discount_type: "amount",
    discount_value: 45,
    product_ids: [productsByKey["selfie-box"], productsByKey["barbe-a-papa"], productsByKey.connect4],
  });
};

const createClients = async (providerId) => ({
  camille: await createClient(providerId, { first_name: "Camille", last_name: "Martin", email: "camille.demo@lokify.fr", phone: "0612345678", address: "7 rue de la Gare, Nantes", notes: "Mariage printemps" }),
  julien: await createClient(providerId, { first_name: "Julien", last_name: "Robert", email: "julien.demo@lokify.fr", phone: "0623456789", address: "4 avenue Victor Hugo, Rennes", notes: "Anniversaire enfant" }),
  lea: await createClient(providerId, { first_name: "Lea", last_name: "Moreau", email: "lea.demo@lokify.fr", phone: "0634567890", address: "21 rue des Plantes, Angers", notes: "Soiree entreprise" }),
});

const buildDateRange = (startOffsetDays, durationDays) => {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  start.setDate(start.getDate() + startOffsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const createDemoReservations = async (providerId, clients, productsByKey) => {
  const currentPeriod = buildDateRange(1, 2);
  const nextPeriod = buildDateRange(6, 2);
  const pastPeriod = buildDateRange(-16, 1);

  await createReservation(providerId, {
    client_id: clients.camille.id,
    start_date: currentPeriod.start,
    end_date: currentPeriod.end,
    status: "confirmed",
    source: "manual",
    fulfillment_mode: "delivery",
    notes: "Reservation demo pour simuler une disponibilite partielle sur la periode par defaut.",
    lines: [
      { item_id: productsByKey.aura, quantity: 1 },
      { item_id: productsByKey["arche-ballons"], quantity: 1 },
    ],
    deposit: { handling_mode: "manual", manual_status: "pending" },
  });

  await createReservation(providerId, {
    client_id: clients.julien.id,
    start_date: currentPeriod.start,
    end_date: currentPeriod.end,
    status: "pending",
    source: "web",
    fulfillment_mode: "pickup",
    notes: "Reservation demo pour rendre un accessoire indisponible sur la vitrine.",
    lines: [
      { item_id: productsByKey["livre-audio"], quantity: 1 },
      { item_id: productsByKey.lounge, quantity: 2 },
    ],
    deposit: { handling_mode: "manual", manual_status: "pending" },
  });

  await createReservation(providerId, {
    client_id: clients.lea.id,
    start_date: nextPeriod.start,
    end_date: nextPeriod.end,
    status: "draft",
    source: "manual",
    fulfillment_mode: "onsite",
    notes: "Reservation future en brouillon pour verifier les cas de recalcul.",
    lines: [
      { item_id: productsByKey["selfie-box"], quantity: 1 },
      { item_id: productsByKey["barbe-a-papa"], quantity: 1 },
    ],
    deposit: { handling_mode: "manual", manual_status: "pending" },
  });

  await createReservation(providerId, {
    client_id: clients.camille.id,
    start_date: pastPeriod.start,
    end_date: pastPeriod.end,
    status: "completed",
    source: "manual",
    fulfillment_mode: "delivery",
    notes: "Historique demo termine.",
    lines: [{ item_id: productsByKey["pack-deco"], quantity: 1 }],
    deposit: { handling_mode: "manual", manual_status: "released" },
  });
};

try {
  const providerId = await createOrUpdateDemoProvider();
  const slug = await prepareProviderWorkspace(providerId);
  await clearDemoData(providerId);
  await createCategories(providerId);
  const productsByKey = await createProducts(providerId);
  await createPacks(providerId, productsByKey);
  const clients = await createClients(providerId);
  await createDemoReservations(providerId, clients, productsByKey);

  console.log(JSON.stringify({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    publicUrl: `https://app.lokify.fr/shop/${slug}`,
    slug,
    envFile: envFilePath,
  }, null, 2));
} finally {
  await pool.end();
}
