import crypto from "crypto";

import { query } from "../config/db.js";
import {
  deleteCatalogManagedPhoto,
  isManagedCatalogPhotoUrl,
  uploadCatalogProductPhoto,
} from "./catalog-photo-storage.service.js";
import { createItem, updateItem } from "./items.service.js";
import HttpError from "../utils/http-error.js";
import {
  MAX_CATALOG_ITEM_PHOTOS,
} from "../utils/catalog-image.js";

const validCatalogModes = new Set(["location", "sale", "resale"]);
const validCategoryStatuses = new Set(["active", "draft", "inactive"]);
const validAssignmentOrders = new Set(["auto", "manual", "fifo"]);
const validPackDiscountTypes = new Set(["none", "amount", "percentage"]);
const standardFrenchTaxRates = [
  { name: "TVA 20 %", rate: 20, is_active: true, is_default: true },
  { name: "TVA 10 %", rate: 10, is_active: false, is_default: false },
  { name: "TVA 5,5 %", rate: 5.5, is_active: false, is_default: false },
  { name: "TVA 2,1 %", rate: 2.1, is_active: false, is_default: false },
];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeOptionalText = (value) => {
  const normalizedValue = normalizeWhitespace(value);
  return normalizedValue || null;
};

const normalizeNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
};

const normalizePhotoUrls = (value) => {
  const seen = new Set();
  const photos = [];

  normalizeStringList(value).forEach((photoUrl) => {
    if (seen.has(photoUrl)) {
      return;
    }

    seen.add(photoUrl);
    photos.push(photoUrl);
  });

  return photos;
};

const normalizePhotoUploadPayloads = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => entry && typeof entry === "object");
};

const normalizeObjectList = (value, builder) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(builder)
    .filter(Boolean);
};

const parseJsonList = (value, fallback = []) => {
  try {
    const parsedValue = JSON.parse(value || "[]");
    return Array.isArray(parsedValue) ? parsedValue : fallback;
  } catch (_error) {
    return fallback;
  }
};

const parseJsonObject = (value, fallback = {}) => {
  try {
    const parsedValue = JSON.parse(value || "{}");
    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? parsedValue
      : fallback;
  } catch (_error) {
    return fallback;
  }
};

const formatTaxRateLabel = (name, rate) => {
  const normalizedName = normalizeWhitespace(name);

  if (normalizedName) {
    return normalizedName;
  }

  if (rate === null || rate === undefined || rate === "") {
    return "TVA personnalisee";
  }

  return `TVA ${String(rate).replace(".", ",")} %`;
};

const buildTaxRateKey = (rate) => {
  const parsedRate = Number(rate);
  return Number.isFinite(parsedRate) ? parsedRate.toFixed(2) : "";
};

const serializeCategory = (row) => ({
  id: row.id,
  user_id: row.user_id,
  slug: row.slug,
  name: row.name,
  type: row.category_type,
  description: row.description || "",
  filters: parseJsonList(row.filters_json),
  inspectionEnabled: Boolean(row.inspection_enabled),
  durations: parseJsonList(row.durations_json),
  ranges: parseJsonList(row.ranges_json),
  status: row.status || "active",
  source: row.source || "custom",
  icon_name: row.icon_name || "",
  image_url: row.image_url || "",
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const serializeTaxRate = (row) => {
  const rate = row.rate === null ? null : Number(row.rate);

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    label: formatTaxRateLabel(row.name, rate),
    rate,
    is_active: Boolean(row.is_active),
    is_default: Boolean(row.is_default),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const serializePackProduct = (row) => ({
  item_id: row.item_id,
  sort_order: Number(row.sort_order || 0),
  name: row.item_name || "",
  public_name: row.public_name || row.item_name || "",
  category_name: row.category_name || "",
  short_description: row.short_description || "",
  price: Number(row.item_price || 0),
  stock: Number(row.item_stock || 0),
  status: row.item_status || "available",
  thumbnail: parseJsonList(row.photos_json)[0] || "",
});

const serializePack = (row, products = []) => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name,
  description: row.description || "",
  discount_type: row.discount_type || "none",
  discount_value: Number(row.discount_value || 0),
  is_active: Boolean(row.is_active),
  products,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const serializeItemProfile = (row) => {
  const priceCustom = parseJsonObject(row.price_custom_json, {});

  return {
    item_id: row.item_id,
    user_id: row.user_id,
    vat: row.vat === null || row.vat === undefined ? null : Number(row.vat),
    tax_rate_id: row.tax_rate_id || "",
    internal_description: row.internal_description || "",
    serial_tracking: Boolean(row.serial_tracking),
    assignment_order: row.assignment_order || "auto",
    availability_note: row.availability_note || "",
    category_slug: row.category_slug || "",
    category_name: row.category_name || "",
    subcategory: row.subcategory || "",
    features: row.features || "",
    custom_filters: row.custom_filters || "",
    documents: parseJsonList(row.documents_json),
    questionnaire: row.questionnaire || "",
    inspection_template: row.inspection_template || "",
    price_weekend: Number(row.price_weekend || 0),
    price_week: Number(row.price_week || 0),
    price_custom: {
      label: row.price_custom_json ? priceCustom.label || "" : "",
      amount:
        row.price_custom_json && priceCustom.amount !== undefined && priceCustom.amount !== null
          ? Number(priceCustom.amount)
          : null,
    },
    online_visible: Boolean(row.online_visible),
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    reservable: row.reservable === undefined ? true : Boolean(row.reservable),
    public_name: row.public_name || "",
    public_description: row.public_description || "",
    long_description: row.long_description || "",
    photos: parseJsonList(row.photos_json),
    related_enabled: Boolean(row.related_enabled),
    related_product_ids: parseJsonList(row.related_product_ids_json),
    related_sort_note: row.related_sort_note || "",
    catalog_mode: row.catalog_mode || "location",
    sku: row.sku || "",
    options: parseJsonList(row.options_json),
    variants: parseJsonList(row.variants_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const normalizeCategoryPayload = (payload = {}) => {
  const name = normalizeWhitespace(payload.name);
  const status = String(payload.status || "active").trim().toLowerCase() || "active";

  return {
    name,
    slug: slugify(payload.slug || payload.id || payload.name),
    type:
      normalizeWhitespace(payload.type || payload.category_type || "Catalogue") || "Catalogue",
    description: normalizeOptionalText(payload.description),
    filters: normalizeStringList(payload.filters),
    inspectionEnabled: Boolean(payload.inspectionEnabled ?? payload.inspection_enabled),
    durations: normalizeObjectList(payload.durations, (entry) => {
      const label = normalizeWhitespace(entry?.label);
      const hours = normalizeNumber(entry?.hours, 0);
      return label ? { label, hours } : null;
    }),
    ranges: normalizeObjectList(payload.ranges, (entry) => {
      const label = normalizeWhitespace(entry?.label);
      const minHours = normalizeNumber(entry?.minHours, 0);
      const maxHours = normalizeNumber(entry?.maxHours, 0);
      return label ? { label, minHours, maxHours } : null;
    }),
    status: validCategoryStatuses.has(status) ? status : "active",
    source: normalizeWhitespace(payload.source || "custom") || "custom",
    icon_name: normalizeOptionalText(payload.icon_name ?? payload.iconName),
    image_url: normalizeOptionalText(payload.image_url ?? payload.imageUrl),
  };
};

const normalizeTaxRatePayload = (payload = {}) => {
  const rate = normalizeOptionalNumber(payload.rate);

  return {
    name: formatTaxRateLabel(payload.name, rate),
    rate,
    is_active: payload.is_active ?? payload.isActive ?? true,
    is_default: Boolean(payload.is_default ?? payload.isDefault),
  };
};

const normalizePackPayload = (payload = {}) => {
  const discountType = String(payload.discount_type ?? payload.discountType ?? "none")
    .trim()
    .toLowerCase();
  const rawItemIds = Array.isArray(payload.product_ids)
    ? payload.product_ids
    : Array.isArray(payload.products)
      ? payload.products.map((entry) => entry?.item_id || entry?.id)
      : [];
  const itemIds = rawItemIds
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
  const discountValue = normalizeNumber(payload.discount_value ?? payload.discountValue, 0);

  return {
    name: normalizeWhitespace(payload.name),
    description: normalizeOptionalText(payload.description),
    discount_type:
      validPackDiscountTypes.has(discountType) && discountValue > 0 ? discountType : "none",
    discount_value: discountValue > 0 ? discountValue : 0,
    is_active: Boolean(payload.is_active ?? payload.isActive ?? true),
    product_ids: itemIds,
  };
};

const normalizeProductOption = (entry) => {
  const name = normalizeWhitespace(entry?.name);
  if (!name) {
    return null;
  }

  return {
    id: normalizeWhitespace(entry?.id) || crypto.randomUUID(),
    name,
    price: normalizeNumber(entry?.price, 0),
    required: Boolean(entry?.required ?? entry?.is_required),
  };
};

const normalizeProductVariant = (entry) => {
  const name = normalizeWhitespace(entry?.name);
  if (!name) {
    return null;
  }

  return {
    id: normalizeWhitespace(entry?.id) || crypto.randomUUID(),
    name,
    price: normalizeNumber(entry?.price, 0),
    stock: normalizeOptionalNumber(entry?.stock),
  };
};

const ensureCategoryPayload = (category) => {
  if (!category.name || !category.slug) {
    throw new HttpError(400, "Le nom de categorie est obligatoire.");
  }
};

const ensurePackPayload = (pack) => {
  if (!pack.name) {
    throw new HttpError(400, "Le nom du pack est obligatoire.");
  }

  if (!validPackDiscountTypes.has(pack.discount_type)) {
    throw new HttpError(400, "Type de remise invalide.");
  }

  if (pack.discount_type === "percentage" && pack.discount_value > 100) {
    throw new HttpError(400, "La remise en pourcentage doit etre inferieure ou egale a 100.");
  }

  if (pack.discount_value < 0) {
    throw new HttpError(400, "La remise du pack ne peut pas etre negative.");
  }
};

const ensureItemOwnedByUser = async (userId, itemId) => {
  const { rows } = await query(
    `
      SELECT id, user_id, name, category, price, stock, status, deposit
      FROM items
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [itemId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Produit introuvable.");
  }

  return rows[0];
};

const listItemsByIds = async (userId, itemIds = []) => {
  if (!itemIds.length) {
    return [];
  }

  const placeholders = itemIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await query(
    `
      SELECT id, name, category, price, stock, status, deposit
      FROM items
      WHERE user_id = $1
        AND id IN (${placeholders})
    `,
    [userId, ...itemIds]
  );

  return rows;
};

const resolveTaxRateForProfile = async (userId, profile) => {
  if (!profile.tax_rate_id) {
    return {
      vat: profile.vat,
      tax_rate_id: null,
    };
  }

  const { rows } = await query(
    `
      SELECT *
      FROM catalog_tax_rates
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [profile.tax_rate_id, userId]
  );

  if (!rows[0]) {
    throw new HttpError(400, "La TVA selectionnee est introuvable.");
  }

  return {
    vat: Number(rows[0].rate),
    tax_rate_id: rows[0].id,
  };
};

const ensureStandardFrenchTaxRates = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM catalog_tax_rates
      WHERE user_id = $1
      ORDER BY created_at ASC
    `,
    [userId]
  );

  const rowsByRate = new Map();
  rows.forEach((row) => {
    const key = buildTaxRateKey(row.rate);
    if (key && !rowsByRate.has(key)) {
      rowsByRate.set(key, row);
    }
  });

  for (const taxRate of standardFrenchTaxRates) {
    const rateKey = buildTaxRateKey(taxRate.rate);

    if (rowsByRate.has(rateKey)) {
      continue;
    }

    const { rows: createdRows } = await query(
      `
        INSERT INTO catalog_tax_rates (
          id,
          user_id,
          name,
          rate,
          is_active,
          is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        crypto.randomUUID(),
        userId,
        taxRate.name,
        taxRate.rate,
        taxRate.is_active,
        taxRate.is_default,
      ]
    );

    rowsByRate.set(rateKey, createdRows[0]);
  }

  const defaultTaxRate = rowsByRate.get(buildTaxRateKey(20));

  if (defaultTaxRate) {
    await query(
      `
        UPDATE catalog_tax_rates
        SET is_default = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
        WHERE user_id = $1
      `,
      [userId, defaultTaxRate.id]
    );
  }

  for (const taxRate of standardFrenchTaxRates) {
    const existingTaxRate = rowsByRate.get(buildTaxRateKey(taxRate.rate));
    if (!existingTaxRate) {
      continue;
    }

    if (existingTaxRate.name === taxRate.name) {
      continue;
    }

    await query(
      `
        UPDATE catalog_tax_rates
        SET name = $3
        WHERE id = $1 AND user_id = $2
      `,
      [existingTaxRate.id, userId, taxRate.name]
    );
  }
};

const savePackProducts = async (userId, packId, itemIds = []) => {
  await query(
    `
      DELETE FROM catalog_pack_products
      WHERE pack_id = $1 AND user_id = $2
    `,
    [packId, userId]
  );

  for (const [index, itemId] of itemIds.entries()) {
    await query(
      `
        INSERT INTO catalog_pack_products (
          id,
          pack_id,
          user_id,
          item_id,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [crypto.randomUUID(), packId, userId, itemId, index]
    );
  }
};

const buildDuplicatedLabel = (value) => {
  const normalized = normalizeWhitespace(value) || "Produit";
  return /\(copie\)$/i.test(normalized) ? normalized : `${normalized} (copie)`;
};

const normalizeCatalogProductMutationPayload = (payload = {}) => {
  const normalizedPayload = payload && typeof payload === "object" ? payload : {};

  return {
    item:
      normalizedPayload.item && typeof normalizedPayload.item === "object"
        ? normalizedPayload.item
        : {},
    profile:
      normalizedPayload.profile && typeof normalizedPayload.profile === "object"
        ? normalizedPayload.profile
        : {},
    photo_uploads: normalizePhotoUploadPayloads(
      normalizedPayload.photo_uploads ?? normalizedPayload.photoUploads
    ),
  };
};

const stripPhotosFromProfilePayload = (payload = {}) => {
  const nextPayload = { ...(payload || {}) };
  delete nextPayload.photos;
  return nextPayload;
};

const listReferencedPhotosByOtherProfiles = async (userId, itemId) => {
  const { rows } = await query(
    `
      SELECT photos_json
      FROM item_profiles
      WHERE user_id = $1
        AND item_id <> $2
    `,
    [userId, itemId]
  );

  const referencedPhotos = new Set();
  rows.forEach((row) => {
    parseJsonList(row.photos_json).forEach((photoUrl) => {
      if (photoUrl) {
        referencedPhotos.add(photoUrl);
      }
    });
  });

  return referencedPhotos;
};

const deleteUnusedManagedCatalogPhotos = async (userId, itemId, photoUrls = []) => {
  const managedPhotoUrls = normalizePhotoUrls(photoUrls).filter(isManagedCatalogPhotoUrl);
  if (!managedPhotoUrls.length) {
    return;
  }

  const referencedPhotos = await listReferencedPhotosByOtherProfiles(userId, itemId);

  for (const photoUrl of managedPhotoUrls) {
    if (referencedPhotos.has(photoUrl)) {
      continue;
    }

    try {
      await deleteCatalogManagedPhoto(photoUrl);
    } catch (error) {
      console.error("Unable to delete unused catalog photo from R2.", {
        itemId,
        photoUrl,
        error,
      });
    }
  }
};

export const listCatalogCategories = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM catalog_categories
      WHERE user_id = $1
      ORDER BY name ASC
    `,
    [userId]
  );

  return rows.map(serializeCategory);
};

export const upsertCatalogCategory = async (userId, payload = {}) => {
  const category = normalizeCategoryPayload(payload);
  ensureCategoryPayload(category);

  const existingCategory = await query(
    `
      SELECT id
      FROM catalog_categories
      WHERE user_id = $1 AND slug = $2
      LIMIT 1
    `,
    [userId, category.slug]
  );

  if (existingCategory.rows[0]) {
    const { rows } = await query(
      `
        UPDATE catalog_categories
        SET name = $3,
            category_type = $4,
            description = $5,
            filters_json = $6,
            inspection_enabled = $7,
            durations_json = $8,
            ranges_json = $9,
            status = $10,
            source = $11,
            icon_name = $12,
            image_url = $13
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [
        existingCategory.rows[0].id,
        userId,
        category.name,
        category.type,
        category.description,
        JSON.stringify(category.filters),
        category.inspectionEnabled,
        JSON.stringify(category.durations),
        JSON.stringify(category.ranges),
        category.status,
        category.source,
        category.icon_name,
        category.image_url,
      ]
    );

    return serializeCategory(rows[0]);
  }

  const categoryId = crypto.randomUUID();
  const { rows } = await query(
    `
      INSERT INTO catalog_categories (
        id,
        user_id,
        slug,
        name,
        category_type,
        description,
        filters_json,
        inspection_enabled,
        durations_json,
        ranges_json,
        status,
        source,
        icon_name,
        image_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `,
    [
      categoryId,
      userId,
      category.slug,
      category.name,
      category.type,
      category.description,
      JSON.stringify(category.filters),
      category.inspectionEnabled,
      JSON.stringify(category.durations),
      JSON.stringify(category.ranges),
      category.status,
      category.source,
      category.icon_name,
      category.image_url,
    ]
  );

  return serializeCategory(rows[0]);
};

export const deleteCatalogCategory = async (userId, categorySlug) => {
  const { rows } = await query(
    `
      DELETE FROM catalog_categories
      WHERE user_id = $1 AND slug = $2
      RETURNING slug, name
    `,
    [userId, categorySlug]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Categorie introuvable.");
  }

  await query(
    `
      UPDATE item_profiles
      SET category_slug = NULL,
          category_name = NULL
      WHERE user_id = $1
        AND (category_slug = $2 OR category_name = $3)
    `,
    [userId, rows[0].slug, rows[0].name]
  );

  return {
    slug: rows[0].slug,
  };
};

export const listCatalogTaxRates = async (userId) => {
  await ensureStandardFrenchTaxRates(userId);

  const { rows } = await query(
    `
      SELECT *
      FROM catalog_tax_rates
      WHERE user_id = $1
      ORDER BY is_default DESC, is_active DESC, rate ASC, name ASC
    `,
    [userId]
  );

  return rows.map(serializeTaxRate);
};

export const createCatalogTaxRate = async (userId, payload = {}) => {
  const taxRate = normalizeTaxRatePayload(payload);

  if (taxRate.rate === null || taxRate.rate < 0) {
    throw new HttpError(400, "Le taux de TVA doit etre positif.");
  }

  if (taxRate.is_default) {
    await query(
      `
        UPDATE catalog_tax_rates
        SET is_default = FALSE
        WHERE user_id = $1
      `,
      [userId]
    );
  }

  const { rows } = await query(
    `
      INSERT INTO catalog_tax_rates (
        id,
        user_id,
        name,
        rate,
        is_active,
        is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      crypto.randomUUID(),
      userId,
      taxRate.name,
      taxRate.rate,
      taxRate.is_active,
      taxRate.is_default,
    ]
  );

  return serializeTaxRate(rows[0]);
};

export const updateCatalogTaxRate = async (userId, taxRateId, payload = {}) => {
  const taxRate = normalizeTaxRatePayload(payload);

  if (taxRate.rate === null || taxRate.rate < 0) {
    throw new HttpError(400, "Le taux de TVA doit etre positif.");
  }

  if (taxRate.is_default) {
    await query(
      `
        UPDATE catalog_tax_rates
        SET is_default = FALSE
        WHERE user_id = $1
          AND id <> $2
      `,
      [userId, taxRateId]
    );
  }

  const { rows } = await query(
    `
      UPDATE catalog_tax_rates
      SET name = $3,
          rate = $4,
          is_active = $5,
          is_default = $6
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [taxRateId, userId, taxRate.name, taxRate.rate, taxRate.is_active, taxRate.is_default]
  );

  if (!rows[0]) {
    throw new HttpError(404, "TVA introuvable.");
  }

  return serializeTaxRate(rows[0]);
};

export const deleteCatalogTaxRate = async (userId, taxRateId) => {
  const { rows } = await query(
    `
      DELETE FROM catalog_tax_rates
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [taxRateId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "TVA introuvable.");
  }

  await query(
    `
      UPDATE item_profiles
      SET tax_rate_id = NULL,
          vat = NULL
      WHERE user_id = $1 AND tax_rate_id = $2
    `,
    [userId, taxRateId]
  );

  return {
    id: rows[0].id,
  };
};

const normalizeItemProfilePayload = (payload = {}, item = null) => {
  const hasExplicitPhotos = Object.prototype.hasOwnProperty.call(payload, "photos");
  const assignmentOrder = String(payload.assignment_order ?? payload.assignmentOrder ?? "auto")
    .trim()
    .toLowerCase();
  const catalogMode = String(payload.catalog_mode ?? payload.catalogMode ?? "location")
    .trim()
    .toLowerCase();
  const categoryName = normalizeWhitespace(
    payload.category_name ?? payload.categoryName ?? item?.category ?? ""
  );
  const categorySlug = slugify(payload.category_slug ?? payload.categorySlug ?? categoryName);
  const customPriceAmount = normalizeOptionalNumber(
    payload.price_custom_amount ??
      payload.priceCustomAmount ??
      payload.price_custom?.amount ??
      payload.priceCustom?.amount
  );
  const customPriceLabel = normalizeWhitespace(
    payload.price_custom_label ??
      payload.priceCustomLabel ??
      payload.price_custom?.label ??
      payload.priceCustom?.label
  );
  const taxRateId = normalizeOptionalText(payload.tax_rate_id ?? payload.taxRateId);

  return {
    vat: normalizeOptionalNumber(payload.vat),
    tax_rate_id: taxRateId,
    internal_description: normalizeOptionalText(
      payload.internal_description ?? payload.internalDescription
    ),
    serial_tracking: Boolean(payload.serial_tracking ?? payload.serialTracking),
    assignment_order: validAssignmentOrders.has(assignmentOrder) ? assignmentOrder : "auto",
    availability_note: normalizeOptionalText(
      payload.availability_note ?? payload.availabilityNote
    ),
    category_slug: categorySlug || null,
    category_name: categoryName || null,
    subcategory: normalizeOptionalText(payload.subcategory),
    features: normalizeOptionalText(payload.features),
    custom_filters: normalizeOptionalText(payload.custom_filters ?? payload.customFilters),
    documents: normalizeStringList(payload.documents),
    questionnaire: normalizeOptionalText(payload.questionnaire),
    inspection_template: normalizeOptionalText(
      payload.inspection_template ?? payload.inspectionTemplate
    ),
    price_weekend: normalizeNumber(payload.price_weekend ?? payload.priceWeekend, item?.price ?? 0),
    price_week: normalizeNumber(payload.price_week ?? payload.priceWeek, item?.price ?? 0),
    price_custom: {
      label: customPriceLabel,
      amount: customPriceAmount,
    },
    online_visible: Boolean(payload.online_visible ?? payload.onlineVisible),
    is_active: payload.is_active ?? payload.isActive ?? true,
    reservable: payload.reservable ?? true,
    public_name:
      normalizeOptionalText(payload.public_name ?? payload.publicName) || item?.name || null,
    public_description: normalizeOptionalText(
      payload.public_description ??
        payload.publicDescription ??
        payload.short_description ??
        payload.shortDescription
    ),
    long_description: normalizeOptionalText(
      payload.long_description ?? payload.longDescription
    ),
    photos: hasExplicitPhotos ? normalizePhotoUrls(payload.photos) : null,
    has_photos: hasExplicitPhotos,
    related_enabled: Boolean(payload.related_enabled ?? payload.relatedEnabled),
    related_product_ids: normalizeStringList(
      payload.related_product_ids ?? payload.relatedProductIds
    ),
    related_sort_note: normalizeOptionalText(
      payload.related_sort_note ?? payload.relatedSortNote
    ),
    catalog_mode: validCatalogModes.has(catalogMode) ? catalogMode : "location",
    sku: normalizeOptionalText(payload.sku),
    options: normalizeObjectList(payload.options, normalizeProductOption),
    variants: normalizeObjectList(payload.variants, normalizeProductVariant),
  };
};

export const listItemProfiles = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM item_profiles
      WHERE user_id = $1
      ORDER BY created_at ASC
    `,
    [userId]
  );

  return rows.map(serializeItemProfile);
};

const getItemProfileByItemId = async (userId, itemId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM item_profiles
      WHERE item_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [itemId, userId]
  );

  return rows[0] ? serializeItemProfile(rows[0]) : null;
};

export const upsertItemProfile = async (userId, itemId, payload = {}) => {
  const item = await ensureItemOwnedByUser(userId, itemId);
  const currentProfile = await getItemProfileByItemId(userId, itemId);
  const profile = normalizeItemProfilePayload(payload, item);
  const resolvedTaxRate = await resolveTaxRateForProfile(userId, profile);
  const ownedRelatedItems = await listItemsByIds(userId, profile.related_product_ids);
  const nextPhotos = profile.has_photos
    ? profile.photos
    : normalizePhotoUrls(currentProfile?.photos || []);

  if (currentProfile) {
    const { rows } = await query(
      `
        UPDATE item_profiles
        SET vat = $3,
            tax_rate_id = $4,
            internal_description = $5,
            serial_tracking = $6,
            assignment_order = $7,
            availability_note = $8,
            category_slug = $9,
            category_name = $10,
            subcategory = $11,
            features = $12,
            custom_filters = $13,
            documents_json = $14,
            questionnaire = $15,
            inspection_template = $16,
            price_weekend = $17,
            price_week = $18,
            price_custom_json = $19,
            online_visible = $20,
            is_active = $21,
            reservable = $22,
            public_name = $23,
            public_description = $24,
            long_description = $25,
            photos_json = $26,
            related_enabled = $27,
            related_product_ids_json = $28,
            related_sort_note = $29,
            catalog_mode = $30,
            sku = $31,
            options_json = $32,
            variants_json = $33
        WHERE item_id = $1 AND user_id = $2
        RETURNING *
      `,
      [
        itemId,
        userId,
        resolvedTaxRate.vat,
        resolvedTaxRate.tax_rate_id,
        profile.internal_description,
        profile.serial_tracking,
        profile.assignment_order,
        profile.availability_note,
        profile.category_slug,
        profile.category_name,
        profile.subcategory,
        profile.features,
        profile.custom_filters,
        JSON.stringify(profile.documents),
        profile.questionnaire,
        profile.inspection_template,
        profile.price_weekend,
        profile.price_week,
        JSON.stringify(profile.price_custom),
        profile.online_visible,
        Boolean(profile.is_active),
        Boolean(profile.reservable),
        profile.public_name,
        profile.public_description,
        profile.long_description,
        JSON.stringify(nextPhotos),
        profile.related_enabled,
        JSON.stringify(ownedRelatedItems.map((relatedItem) => relatedItem.id)),
        profile.related_sort_note,
        profile.catalog_mode,
        profile.sku,
        JSON.stringify(profile.options),
        JSON.stringify(profile.variants),
      ]
    );

    return serializeItemProfile(rows[0]);
  }

  const { rows } = await query(
    `
      INSERT INTO item_profiles (
        item_id,
        user_id,
        vat,
        tax_rate_id,
        internal_description,
        serial_tracking,
        assignment_order,
        availability_note,
        category_slug,
        category_name,
        subcategory,
        features,
        custom_filters,
        documents_json,
        questionnaire,
        inspection_template,
        price_weekend,
        price_week,
        price_custom_json,
        online_visible,
        is_active,
        reservable,
        public_name,
        public_description,
        long_description,
        photos_json,
        related_enabled,
        related_product_ids_json,
        related_sort_note,
        catalog_mode,
        sku,
        options_json,
        variants_json
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33
      )
      RETURNING *
    `,
    [
      itemId,
      userId,
      resolvedTaxRate.vat,
      resolvedTaxRate.tax_rate_id,
      profile.internal_description,
      profile.serial_tracking,
      profile.assignment_order,
      profile.availability_note,
      profile.category_slug,
      profile.category_name,
      profile.subcategory,
      profile.features,
      profile.custom_filters,
      JSON.stringify(profile.documents),
      profile.questionnaire,
      profile.inspection_template,
      profile.price_weekend,
      profile.price_week,
      JSON.stringify(profile.price_custom),
      profile.online_visible,
      Boolean(profile.is_active),
      Boolean(profile.reservable),
      profile.public_name,
      profile.public_description,
      profile.long_description,
      JSON.stringify(nextPhotos),
      profile.related_enabled,
      JSON.stringify(ownedRelatedItems.map((relatedItem) => relatedItem.id)),
      profile.related_sort_note,
      profile.catalog_mode,
      profile.sku,
      JSON.stringify(profile.options),
      JSON.stringify(profile.variants),
    ]
  );

  return serializeItemProfile(rows[0]);
};

const syncItemProfilePhotos = async (
  userId,
  itemId,
  { retainedPhotos, photoUploads = [] } = {}
) => {
  const item = await ensureItemOwnedByUser(userId, itemId);
  const currentProfile = await getItemProfileByItemId(userId, itemId);
  const currentPhotos = normalizePhotoUrls(currentProfile?.photos || []);
  const nextRetainedPhotos =
    retainedPhotos === undefined ? currentPhotos : normalizePhotoUrls(retainedPhotos);
  const normalizedPhotoUploads = normalizePhotoUploadPayloads(photoUploads);

  if (nextRetainedPhotos.length + normalizedPhotoUploads.length > MAX_CATALOG_ITEM_PHOTOS) {
    throw new HttpError(
      400,
      `Vous ne pouvez pas ajouter plus de ${MAX_CATALOG_ITEM_PHOTOS} images sur ce produit.`,
      { code: "catalog_image_limit" }
    );
  }

  const uploadedPhotos = [];
  const uploadFailures = [];

  for (const photoUpload of normalizedPhotoUploads) {
    try {
      const uploadedPhoto = await uploadCatalogProductPhoto({
        itemId,
        payload: photoUpload,
      });

      uploadedPhotos.push(uploadedPhoto.publicUrl);
    } catch (error) {
      uploadFailures.push({
        statusCode: error.statusCode || 502,
        code: error.code || "catalog_image_upload_failed",
        message: error.message || "L'image n'a pas pu etre envoyee.",
      });
    }
  }

  const hasUploadFailure = normalizedPhotoUploads.length > 0 && uploadFailures.length > 0;
  const hadRequestedRemovals = currentPhotos.some(
    (photoUrl) => !nextRetainedPhotos.includes(photoUrl)
  );
  const finalPhotos = hasUploadFailure
    ? normalizePhotoUrls([...currentPhotos, ...uploadedPhotos])
    : normalizePhotoUrls([...nextRetainedPhotos, ...uploadedPhotos]);
  const removedPhotos = hasUploadFailure
    ? []
    : currentPhotos.filter((photoUrl) => !finalPhotos.includes(photoUrl));
  const nextProfile = await upsertItemProfile(userId, itemId, {
    ...(currentProfile || {}),
    public_name: currentProfile?.public_name || item.name,
    photos: finalPhotos,
  });

  await deleteUnusedManagedCatalogPhotos(userId, itemId, removedPhotos);

  return {
    itemProfile: nextProfile,
    uploadFailures,
    keptExistingPhotos: hasUploadFailure && hadRequestedRemovals,
  };
};

export const createCatalogProduct = async (userId, payload = {}) => {
  const normalizedPayload = normalizeCatalogProductMutationPayload(payload);
  const item = await createItem(userId, normalizedPayload.item);
  const itemProfile = await upsertItemProfile(
    userId,
    item.id,
    stripPhotosFromProfilePayload(normalizedPayload.profile)
  );
  const photoSyncResult = await syncItemProfilePhotos(userId, item.id, {
    retainedPhotos: normalizedPayload.profile.photos,
    photoUploads: normalizedPayload.photo_uploads,
  });

  return {
    item,
    itemProfile: photoSyncResult.itemProfile || itemProfile,
    photoUploadFailures: photoSyncResult.uploadFailures,
    keptExistingPhotos: photoSyncResult.keptExistingPhotos,
  };
};

export const updateCatalogProduct = async (userId, itemId, payload = {}) => {
  const normalizedPayload = normalizeCatalogProductMutationPayload(payload);
  const item = await updateItem(userId, itemId, normalizedPayload.item);
  const itemProfile = await upsertItemProfile(
    userId,
    itemId,
    stripPhotosFromProfilePayload(normalizedPayload.profile)
  );
  const photoSyncResult = await syncItemProfilePhotos(userId, itemId, {
    retainedPhotos: normalizedPayload.profile.photos,
    photoUploads: normalizedPayload.photo_uploads,
  });

  return {
    item,
    itemProfile: photoSyncResult.itemProfile || itemProfile,
    photoUploadFailures: photoSyncResult.uploadFailures,
    keptExistingPhotos: photoSyncResult.keptExistingPhotos,
  };
};

export const appendItemProfilePhoto = async (userId, itemId, payload = {}) => {
  const currentProfile = await getItemProfileByItemId(userId, itemId);
  const photoSyncResult = await syncItemProfilePhotos(userId, itemId, {
    retainedPhotos: currentProfile?.photos || [],
    photoUploads: [payload],
  });

  if (photoSyncResult.uploadFailures.length) {
    throw new HttpError(photoSyncResult.uploadFailures[0].statusCode || 502, photoSyncResult.uploadFailures[0].message, {
      code: photoSyncResult.uploadFailures[0].code,
    });
  }

  return photoSyncResult.itemProfile;
};

const getCatalogPackById = async (userId, packId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM catalog_packs
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [packId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Pack introuvable.");
  }

  const { rows: productRows } = await query(
    `
      SELECT
        catalog_pack_products.pack_id,
        catalog_pack_products.item_id,
        catalog_pack_products.sort_order,
        items.name AS item_name,
        items.price AS item_price,
        items.stock AS item_stock,
        items.status AS item_status,
        COALESCE(item_profiles.public_name, items.name) AS public_name,
        COALESCE(item_profiles.public_description, '') AS short_description,
        COALESCE(item_profiles.category_name, items.category, '') AS category_name,
        COALESCE(item_profiles.photos_json, '[]') AS photos_json
      FROM catalog_pack_products
      INNER JOIN items
        ON items.id = catalog_pack_products.item_id
      LEFT JOIN item_profiles
        ON item_profiles.item_id = items.id
       AND item_profiles.user_id = items.user_id
      WHERE catalog_pack_products.pack_id = $1
        AND catalog_pack_products.user_id = $2
      ORDER BY catalog_pack_products.sort_order ASC, catalog_pack_products.created_at ASC
    `,
    [packId, userId]
  );

  return serializePack(rows[0], productRows.map(serializePackProduct));
};

export const listCatalogPacks = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM catalog_packs
      WHERE user_id = $1
      ORDER BY created_at DESC, name ASC
    `,
    [userId]
  );

  if (!rows.length) {
    return [];
  }

  const { rows: productRows } = await query(
    `
      SELECT
        catalog_pack_products.pack_id,
        catalog_pack_products.item_id,
        catalog_pack_products.sort_order,
        items.name AS item_name,
        items.price AS item_price,
        items.stock AS item_stock,
        items.status AS item_status,
        COALESCE(item_profiles.public_name, items.name) AS public_name,
        COALESCE(item_profiles.public_description, '') AS short_description,
        COALESCE(item_profiles.category_name, items.category, '') AS category_name,
        COALESCE(item_profiles.photos_json, '[]') AS photos_json
      FROM catalog_pack_products
      INNER JOIN catalog_packs
        ON catalog_packs.id = catalog_pack_products.pack_id
      INNER JOIN items
        ON items.id = catalog_pack_products.item_id
      LEFT JOIN item_profiles
        ON item_profiles.item_id = items.id
       AND item_profiles.user_id = items.user_id
      WHERE catalog_pack_products.user_id = $1
      ORDER BY catalog_pack_products.sort_order ASC, catalog_pack_products.created_at ASC
    `,
    [userId]
  );

  const productMap = new Map();
  productRows.forEach((row) => {
    const bucket = productMap.get(row.pack_id) || [];
    bucket.push(serializePackProduct(row));
    productMap.set(row.pack_id, bucket);
  });

  return rows.map((row) => serializePack(row, productMap.get(row.id) || []));
};

export const createCatalogPack = async (userId, payload = {}) => {
  const pack = normalizePackPayload(payload);
  ensurePackPayload(pack);

  const ownedItems = await listItemsByIds(userId, pack.product_ids);
  if (ownedItems.length !== pack.product_ids.length) {
    throw new HttpError(400, "Un ou plusieurs produits du pack sont introuvables.");
  }

  const packId = crypto.randomUUID();
  await query(
    `
      INSERT INTO catalog_packs (
        id,
        user_id,
        name,
        description,
        discount_type,
        discount_value,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      packId,
      userId,
      pack.name,
      pack.description,
      pack.discount_type,
      pack.discount_value,
      pack.is_active,
    ]
  );

  await savePackProducts(userId, packId, pack.product_ids);

  return getCatalogPackById(userId, packId);
};

export const updateCatalogPack = async (userId, packId, payload = {}) => {
  const pack = normalizePackPayload(payload);
  ensurePackPayload(pack);

  const ownedItems = await listItemsByIds(userId, pack.product_ids);
  if (ownedItems.length !== pack.product_ids.length) {
    throw new HttpError(400, "Un ou plusieurs produits du pack sont introuvables.");
  }

  const { rows } = await query(
    `
      UPDATE catalog_packs
      SET name = $3,
          description = $4,
          discount_type = $5,
          discount_value = $6,
          is_active = $7
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [
      packId,
      userId,
      pack.name,
      pack.description,
      pack.discount_type,
      pack.discount_value,
      pack.is_active,
    ]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Pack introuvable.");
  }

  await savePackProducts(userId, packId, pack.product_ids);

  return getCatalogPackById(userId, packId);
};

export const deleteCatalogPack = async (userId, packId) => {
  const { rows } = await query(
    `
      DELETE FROM catalog_packs
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [packId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Pack introuvable.");
  }

  return {
    id: rows[0].id,
  };
};

export const duplicateCatalogPack = async (userId, packId) => {
  const existingPack = await getCatalogPackById(userId, packId);

  return createCatalogPack(userId, {
    ...existingPack,
    name: buildDuplicatedLabel(existingPack.name),
    product_ids: existingPack.products.map((product) => product.item_id),
  });
};

export const duplicateCatalogItem = async (userId, itemId) => {
  const item = await ensureItemOwnedByUser(userId, itemId);
  const duplicatedName = buildDuplicatedLabel(item.name);
  const duplicatedItemId = crypto.randomUUID();

  await query(
    `
      INSERT INTO items (
        id,
        user_id,
        name,
        category,
        stock,
        status,
        price,
        deposit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      duplicatedItemId,
      userId,
      duplicatedName,
      item.category || "",
      Number(item.stock || 0),
      item.status || "available",
      Number(item.price || 0),
      Number(item.deposit || 0),
    ]
  );

  const { rows: profileRows } = await query(
    `
      SELECT *
      FROM item_profiles
      WHERE item_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [itemId, userId]
  );

  if (profileRows[0]) {
    const serializedProfile = serializeItemProfile(profileRows[0]);

    await upsertItemProfile(userId, duplicatedItemId, {
      ...serializedProfile,
      public_name: serializedProfile.public_name
        ? buildDuplicatedLabel(serializedProfile.public_name)
        : duplicatedName,
      sku: null,
    });
  }

  const duplicatedItem = await ensureItemOwnedByUser(userId, duplicatedItemId);
  const { rows: duplicatedProfileRows } = await query(
    `
      SELECT *
      FROM item_profiles
      WHERE item_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [duplicatedItemId, userId]
  );

  return {
    item: duplicatedItem,
    itemProfile: duplicatedProfileRows[0] ? serializeItemProfile(duplicatedProfileRows[0]) : null,
  };
};
