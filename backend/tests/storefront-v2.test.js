import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { query } from "../src/config/db.js";
import { createCatalogPack, upsertItemProfile } from "../src/services/catalog.service.js";
import { createReservation } from "../src/services/reservations.service.js";
import {
  getPublicStorefrontPreview,
  getStorefrontPreview,
  getStorefrontSettings,
  submitPublicStorefrontRequest,
  submitStorefrontRequest,
  updateStorefrontSettings,
} from "../src/services/storefront.service.js";
import { updateItem } from "../src/services/items.service.js";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const storefrontMailOutboxDir = path.join(projectRoot, ".lokify-runtime", "mail-outbox");

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );

  return rows[0].id;
};

const getFirstClientId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM clients WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

const getStorefrontItems = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM items
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 2
    `,
    [userId]
  );

  return rows;
};

test("storefront preview exposes visible products with real availability", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const [firstItem, secondItem] = await getStorefrontItems(userId);
  const baseOffsetDays = 260 + Math.floor(Math.random() * 80);
  const startDate = new Date(Date.now() + baseOffsetDays * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  await updateItem(userId, firstItem.id, {
    ...firstItem,
    stock: 3,
    status: "available",
    price: 120,
    deposit: 500,
  });
  await updateItem(userId, secondItem.id, {
    ...secondItem,
    stock: 2,
    status: "available",
    price: 90,
    deposit: 300,
  });
  await upsertItemProfile(userId, firstItem.id, {
    online_visible: true,
    public_name: "Produit boutique A",
    public_description: "Visible en ligne",
    catalog_mode: "location",
    serial_tracking: false,
  });
  await upsertItemProfile(userId, secondItem.id, {
    online_visible: true,
    public_name: "Produit boutique B",
    public_description: "Visible en ligne",
    catalog_mode: "location",
    serial_tracking: false,
  });

  await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    lines: [{ item_id: firstItem.id, quantity: 1 }],
    notes: `Storefront preview ${crypto.randomUUID()}`,
  });

  const preview = await getStorefrontPreview(userId, {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });

  assert.ok(preview.products.length >= 2);

  const previewProduct = preview.products.find((product) => product.id === firstItem.id);
  assert.ok(previewProduct);
  assert.equal(previewProduct.public_name, "Produit boutique A");
  assert.equal(previewProduct.available_quantity, 2);
  assert.equal(previewProduct.status, "available");
});

test("submitStorefrontRequest creates a pending multi-product reservation from web", async () => {
  const userId = await getDemoUserId();
  const [firstItem, secondItem] = await getStorefrontItems(userId);
  const uniqueSuffix = crypto.randomUUID();
  const startDate = new Date(Date.now() + (360 + Math.floor(Math.random() * 60)) * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  await updateItem(userId, firstItem.id, {
    ...firstItem,
    stock: 3,
    status: "available",
    price: 120,
    deposit: 500,
  });
  await updateItem(userId, secondItem.id, {
    ...secondItem,
    stock: 2,
    status: "available",
    price: 90,
    deposit: 300,
  });
  await upsertItemProfile(userId, firstItem.id, {
    online_visible: true,
    public_name: "Produit boutique A",
    catalog_mode: "location",
    serial_tracking: false,
  });
  await upsertItemProfile(userId, secondItem.id, {
    online_visible: true,
    public_name: "Produit boutique B",
    catalog_mode: "location",
    serial_tracking: false,
  });

  const result = await submitStorefrontRequest(userId, {
    customer: {
      first_name: "Camille",
      last_name: "Boutique",
      email: `camille.${uniqueSuffix}@lokify.test`,
      phone: "0601020304",
      address: "12 rue de la vitrine",
      notes: "Merci de confirmer.",
    },
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    fulfillment_mode: "delivery",
    lines: [
      { item_id: firstItem.id, quantity: 1 },
      { item_id: secondItem.id, quantity: 1 },
    ],
  });

  assert.equal(result.client.email, `camille.${uniqueSuffix}@lokify.test`);
  assert.equal(result.reservation.source, "web");
  assert.equal(result.reservation.status, "pending");
  assert.equal(result.reservation.line_count, 2);
  assert.equal(result.reservation.total_quantity, 2);
  assert.equal(result.reservation.total_deposit, 800);
  assert.equal(result.reservation.fulfillment_mode, "delivery");
});

test("public storefront uses persisted settings, publication status and automatic approval", async () => {
  const userId = await getDemoUserId();
  const [firstItem] = await getStorefrontItems(userId);
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const storefrontSettings = await getStorefrontSettings(userId);
  const startDate = new Date(Date.now() + (420 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  await updateItem(userId, firstItem.id, {
    ...firstItem,
    stock: 4,
    status: "available",
    price: 135,
    deposit: 250,
  });
  await upsertItemProfile(userId, firstItem.id, {
    online_visible: true,
    is_active: true,
    reservable: true,
    public_name: `Produit public ${uniqueSuffix}`,
    public_description: "Visible sur la vitrine publique",
    long_description: "Description complete publique",
    photos: ["https://cdn.lokify.test/demo.jpg"],
    catalog_mode: "location",
    serial_tracking: false,
  });

  const publishedSettings = await updateStorefrontSettings(userId, {
    slug: storefrontSettings.slug,
    is_published: true,
    reservation_approval_mode: "automatic",
  });

  const publicPreview = await getPublicStorefrontPreview(publishedSettings.slug, {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });

  assert.equal(publicPreview.storefront.slug, publishedSettings.slug);
  assert.equal(publicPreview.storefront.is_published, true);
  assert.equal(publicPreview.storefront.reservation_approval_mode, "automatic");
  assert.ok(publicPreview.products.some((product) => product.id === firstItem.id));

  const result = await submitPublicStorefrontRequest(publishedSettings.slug, {
    customer: {
      first_name: "Lucie",
      last_name: "Public",
      email: `lucie.${uniqueSuffix}@lokify.test`,
    },
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    lines: [{ item_id: firstItem.id, quantity: 1 }],
  });

  assert.equal(result.reservation.source, "web");
  assert.equal(result.reservation.status, "confirmed");

  await updateStorefrontSettings(userId, {
    slug: publishedSettings.slug,
    is_published: false,
    reservation_approval_mode: "manual",
  });

  await assert.rejects(
    () =>
      getPublicStorefrontPreview(publishedSettings.slug, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      }),
    /Boutique indisponible/
  );
});

test("storefront supports packs and product options inside a multi-entry cart", async () => {
  const userId = await getDemoUserId();
  const [firstItem, secondItem] = await getStorefrontItems(userId);
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const startDate = new Date(Date.now() + (520 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  await updateItem(userId, firstItem.id, {
    ...firstItem,
    stock: 6,
    status: "available",
    price: 120,
    deposit: 300,
  });
  await updateItem(userId, secondItem.id, {
    ...secondItem,
    stock: 4,
    status: "available",
    price: 80,
    deposit: 200,
  });
  await upsertItemProfile(userId, firstItem.id, {
    online_visible: true,
    is_active: true,
    reservable: true,
    public_name: `Produit options ${uniqueSuffix}`,
    public_description: "Produit avec options",
    catalog_mode: "location",
    options: [{ id: `option-${uniqueSuffix}`, name: "Livraison premium", price: 25, required: false }],
    serial_tracking: false,
  });
  await upsertItemProfile(userId, secondItem.id, {
    online_visible: true,
    is_active: true,
    reservable: true,
    public_name: `Produit pack ${uniqueSuffix}`,
    public_description: "Produit inclus dans un pack",
    catalog_mode: "location",
    serial_tracking: false,
  });

  const pack = await createCatalogPack(userId, {
    name: `Pack public ${uniqueSuffix}`,
    description: "Pack visible en boutique",
    discount_type: "amount",
    discount_value: 10,
    product_ids: [firstItem.id, secondItem.id],
    is_active: true,
  });

  const preview = await getStorefrontPreview(userId, {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });

  const previewProduct = preview.products.find((product) => product.id === firstItem.id);
  const previewPack = preview.packs.find((entry) => entry.id === pack.id);

  assert.ok(previewProduct);
  assert.equal(previewProduct.options.length, 1);
  assert.ok(previewPack);
  assert.equal(previewPack.available_quantity, 4);

  const result = await submitStorefrontRequest(userId, {
    customer: {
      first_name: "Nina",
      last_name: "Panier",
      email: `nina.${uniqueSuffix}@lokify.test`,
    },
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    cart_items: [
      {
        entry_type: "product",
        item_id: firstItem.id,
        quantity: 1,
        option_ids: [`option-${uniqueSuffix}`],
      },
      {
        entry_type: "pack",
        pack_id: pack.id,
        quantity: 1,
      },
    ],
  });

  assert.equal(result.reservation.source, "web");
  assert.equal(result.reservation.line_count, 3);
  assert.equal(result.reservation.total_quantity, 3);
  assert.equal(result.reservation.total_deposit, 800);
  assert.equal(result.reservation.total_amount, 335);
  assert.ok(result.reservation.notes.includes("Pack public"));
  assert.ok(result.reservation.lines.some((line) => line.notes.includes("Pack: Pack public")));
  assert.ok(result.reservation.lines.some((line) => line.notes.includes("Livraison premium")));
});

test("storefront sends a provider email with cart details and VAT breakdown", async () => {
  const userId = await getDemoUserId();
  const [firstItem, secondItem] = await getStorefrontItems(userId);
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const startDate = new Date(Date.now() + (620 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  await fs.rm(storefrontMailOutboxDir, { recursive: true, force: true });

  await updateItem(userId, firstItem.id, {
    ...firstItem,
    stock: 6,
    status: "available",
    price: 120,
    deposit: 300,
  });
  await updateItem(userId, secondItem.id, {
    ...secondItem,
    stock: 4,
    status: "available",
    price: 80,
    deposit: 200,
  });
  await upsertItemProfile(userId, firstItem.id, {
    online_visible: true,
    is_active: true,
    reservable: true,
    public_name: `Produit email ${uniqueSuffix}`,
    public_description: "Produit email avec option",
    catalog_mode: "location",
    vat: 20,
    options: [{ id: `option-email-${uniqueSuffix}`, name: "Livraison premium", price: 25, required: false }],
    serial_tracking: false,
  });
  await upsertItemProfile(userId, secondItem.id, {
    online_visible: true,
    is_active: true,
    reservable: true,
    public_name: `Produit pack email ${uniqueSuffix}`,
    public_description: "Produit dans le pack email",
    catalog_mode: "location",
    vat: 10,
    serial_tracking: false,
  });

  const pack = await createCatalogPack(userId, {
    name: `Pack email ${uniqueSuffix}`,
    description: "Pack utilise pour le mail prestataire",
    discount_type: "amount",
    discount_value: 10,
    product_ids: [firstItem.id, secondItem.id],
    is_active: true,
  });

  const result = await submitStorefrontRequest(userId, {
    customer: {
      first_name: "Sonia",
      last_name: "Email",
      email: `sonia.${uniqueSuffix}@lokify.test`,
      phone: "0609090909",
      address: "9 rue du mail",
      notes: "Merci de prevoir une installation rapide.",
    },
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    notes: "Merci de prevoir une installation rapide.",
    cart_items: [
      {
        entry_type: "product",
        item_id: firstItem.id,
        quantity: 1,
        option_ids: [`option-email-${uniqueSuffix}`],
      },
      {
        entry_type: "pack",
        pack_id: pack.id,
        quantity: 1,
      },
    ],
  });

  const outboxFiles = await fs.readdir(storefrontMailOutboxDir);
  assert.equal(outboxFiles.length, 1);

  const outboxPayload = JSON.parse(
    await fs.readFile(path.join(storefrontMailOutboxDir, outboxFiles[0]), "utf8")
  );

  assert.match(outboxPayload.subject, /nouvelle reservation boutique/i);
  assert.match(outboxPayload.text, /sonia\..+@lokify\.test/i);
  assert.match(outboxPayload.text, /Pack email/i);
  assert.match(outboxPayload.text, /Livraison premium/i);
  assert.match(outboxPayload.text, /TVA appliquee: 20%/i);
  assert.match(outboxPayload.text, /Total TVA: 50,08\s*€/i);
  assert.match(outboxPayload.text, /Total TTC: 335,00\s*€/i);
  assert.match(outboxPayload.text, /Merci de prevoir une installation rapide/i);
  assert.equal(result.reservation.total_amount, 335);
});
