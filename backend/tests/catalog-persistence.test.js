import assert from "node:assert/strict";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  listCatalogCategories,
  listCatalogTaxRates,
  listItemProfiles,
  upsertCatalogCategory,
  upsertItemProfile,
} from "../src/services/catalog.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );
  return rows[0].id;
};

const getFirstItemId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );
  return rows[0].id;
};

const getFirstItemIds = async (userId, limit = 2) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2",
    [userId, limit]
  );
  return rows.map((row) => row.id);
};

test("catalog categories are persisted and upserted by slug", async () => {
  const userId = await getDemoUserId();
  const createdCategory = await upsertCatalogCategory(userId, {
    name: "Location de tonnelles",
    type: "Evenementiel",
    filters: ["surface", "couleur"],
    durations: [{ label: "Journee", hours: 10 }],
    ranges: [{ label: "Week-end", minHours: 24, maxHours: 48 }],
  });

  assert.equal(createdCategory.slug, "location-de-tonnelles");
  assert.deepEqual(createdCategory.filters, ["surface", "couleur"]);

  const updatedCategory = await upsertCatalogCategory(userId, {
    name: "Location de tonnelles",
    type: "Evenementiel premium",
    filters: ["surface", "montage"],
  });

  assert.equal(updatedCategory.slug, "location-de-tonnelles");
  assert.equal(updatedCategory.type, "Evenementiel premium");

  const categories = await listCatalogCategories(userId);
  const tonnelleCategory = categories.find((category) => category.slug === "location-de-tonnelles");

  assert.ok(tonnelleCategory);
  assert.deepEqual(tonnelleCategory.filters, ["surface", "montage"]);
});

test("item profiles are persisted independently from base items", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const relatedProductIds = (await getFirstItemIds(userId, 3)).filter((id) => id !== itemId).slice(0, 2);

  const itemProfile = await upsertItemProfile(userId, itemId, {
    category_name: "Animation photo",
    category_slug: "animation-photo",
    public_name: "Photobooth Signature",
    public_description: "Version publique persistante pour la boutique.",
    online_visible: true,
    catalog_mode: "location",
    price_weekend: 590,
    price_week: 1590,
    documents: ["Notice client", "Checklist terrain"],
    related_product_ids: relatedProductIds,
    sku: "REF-PHOTO-SIGNATURE",
  });

  assert.equal(itemProfile.public_name, "Photobooth Signature");
  assert.equal(itemProfile.online_visible, true);
  assert.deepEqual(itemProfile.documents, ["Notice client", "Checklist terrain"]);

  const profiles = await listItemProfiles(userId);
  const persistedProfile = profiles.find((profile) => profile.item_id === itemId);

  assert.ok(persistedProfile);
  assert.equal(persistedProfile.sku, "REF-PHOTO-SIGNATURE");
  assert.equal(persistedProfile.price_weekend, 590);
  assert.deepEqual(persistedProfile.related_product_ids, relatedProductIds);
});

test("catalog tax rates expose the standard French VAT set with 20% as default", async () => {
  const userId = await getDemoUserId();
  const taxRates = await listCatalogTaxRates(userId);
  const taxRatesByKey = new Map(
    taxRates.map((taxRate) => [Number(taxRate.rate || 0).toFixed(2), taxRate])
  );

  assert.ok(taxRatesByKey.has("20.00"));
  assert.ok(taxRatesByKey.has("10.00"));
  assert.ok(taxRatesByKey.has("5.50"));
  assert.ok(taxRatesByKey.has("2.10"));
  assert.equal(taxRatesByKey.get("20.00")?.is_default, true);
});
