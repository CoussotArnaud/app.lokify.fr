import assert from "node:assert/strict";
import crypto from "crypto";
import { afterEach, beforeEach, test } from "node:test";

import sharp from "sharp";

import { query } from "../src/config/db.js";
import {
  appendItemProfilePhoto,
  createCatalogProduct,
  listCatalogCategories,
  listCatalogTaxRates,
  listItemProfiles,
  updateCatalogProduct,
  upsertCatalogCategory,
  upsertItemProfile,
} from "../src/services/catalog.service.js";
import {
  resetCloudflareR2ServiceOverrideForTests,
  setCloudflareR2ServiceOverrideForTests,
} from "../src/services/cloudflare-r2.service.js";

const uploadedObjectKeys = [];
const deletedObjectKeys = [];
let failUploads = false;

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

const buildPngDataUrl = (width, height, size = 12 * 1024) => {
  const buffer = Buffer.alloc(size, 0);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer.writeUInt8(8, 24);
  buffer.writeUInt8(2, 25);
  buffer.writeUInt8(0, 26);
  buffer.writeUInt8(0, 27);
  buffer.writeUInt8(0, 28);

  return `data:image/png;base64,${buffer.toString("base64")}`;
};

const buildRealJpegDataUrl = async (width, height) => {
  const rawBuffer = crypto.randomBytes(width * height * 3);
  const jpegBuffer = await sharp(rawBuffer, {
    raw: {
      width,
      height,
      channels: 3,
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
};

const buildManagedPhotoUrl = (objectKey) =>
  `https://cdn.lokify.test/${String(objectKey || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

const extractManagedObjectKey = (photoUrl) => {
  const prefix = "https://cdn.lokify.test/";
  if (!String(photoUrl || "").startsWith(prefix)) {
    return null;
  }

  return decodeURIComponent(String(photoUrl).slice(prefix.length));
};

beforeEach(() => {
  uploadedObjectKeys.length = 0;
  deletedObjectKeys.length = 0;
  failUploads = false;

  setCloudflareR2ServiceOverrideForTests({
    buildPublicUrl: buildManagedPhotoUrl,
    extractObjectKeyFromPublicUrl: extractManagedObjectKey,
    isManagedPublicUrl: (photoUrl) => String(photoUrl || "").startsWith("https://cdn.lokify.test/"),
    uploadObject: async ({ objectKey }) => {
      if (failUploads) {
        const error = new Error("L'image n'a pas pu etre envoyee vers le stockage distant.");
        error.code = "catalog_image_upload_failed";
        error.statusCode = 502;
        throw error;
      }

      uploadedObjectKeys.push(objectKey);
      return {
        objectKey,
        publicUrl: buildManagedPhotoUrl(objectKey),
      };
    },
    deleteObject: async (objectKey) => {
      deletedObjectKeys.push(objectKey);
    },
  });
});

afterEach(() => {
  resetCloudflareR2ServiceOverrideForTests();
});

test("catalog categories are persisted and upserted by slug", async () => {
  const userId = await getDemoUserId();
  const createdCategoryResult = await upsertCatalogCategory(userId, {
    name: "Location de tonnelles",
    type: "Evenementiel",
    filters: ["surface", "couleur"],
    durations: [{ label: "Journee", hours: 10 }],
    ranges: [{ label: "Week-end", minHours: 24, maxHours: 48 }],
  });
  const createdCategory = createdCategoryResult.category;

  assert.equal(createdCategory.slug, "location-de-tonnelles");
  assert.deepEqual(createdCategory.filters, ["surface", "couleur"]);
  assert.deepEqual(createdCategoryResult.imageUploadFailures, []);

  const updatedCategoryResult = await upsertCatalogCategory(userId, {
    name: "Location de tonnelles",
    type: "Evenementiel premium",
    filters: ["surface", "montage"],
  });
  const updatedCategory = updatedCategoryResult.category;

  assert.equal(updatedCategory.slug, "location-de-tonnelles");
  assert.equal(updatedCategory.type, "Evenementiel premium");

  const categories = await listCatalogCategories(userId);
  const tonnelleCategory = categories.find((category) => category.slug === "location-de-tonnelles");

  assert.ok(tonnelleCategory);
  assert.deepEqual(tonnelleCategory.filters, ["surface", "montage"]);
});

test("catalog category creation with image stores only a public R2 URL in base", async () => {
  const userId = await getDemoUserId();
  const imageDataUrl = await buildRealJpegDataUrl(1200, 900);
  const result = await upsertCatalogCategory(userId, {
    name: "Scenographie premium",
    type: "Evenementiel",
    image_alt_text: "Scenographie premium pour scene evenementielle",
    image_uploads: [
      {
        data_url: imageDataUrl,
        file_name: "scenographie-premium.jpg",
        kind: "thumbnail",
        alt_text: "Scenographie premium pour scene evenementielle",
      },
    ],
  });

  assert.equal(result.imageUploadFailures.length, 0);
  assert.match(result.category.image_url, /^https:\/\/cdn\.lokify\.test\/categories\//);
  assert.equal(result.category.images.length, 1);
  assert.equal(result.category.images[0].url.startsWith("data:image/"), false);
  assert.match(result.category.images[0].url, /^https:\/\/cdn\.lokify\.test\/categories\//);
  assert.equal(result.category.images[0].kind, "thumbnail");
  assert.equal(result.category.image_alt_text, "Scenographie premium pour scene evenementielle");

  const { rows } = await query(
    "SELECT image_url, images_json FROM catalog_categories WHERE user_id = $1 AND slug = $2",
    [userId, "scenographie-premium"]
  );
  const persistedImages = JSON.parse(rows[0].images_json);

  assert.match(rows[0].image_url, /^https:\/\/cdn\.lokify\.test\/categories\//);
  assert.equal(persistedImages.length, 1);
  assert.equal(String(persistedImages[0].url || "").startsWith("data:image/"), false);
  assert.match(persistedImages[0].url, /^https:\/\/cdn\.lokify\.test\/categories\//);
});

test("catalog category stores SEO fields and optional logo image", async () => {
  const userId = await getDemoUserId();
  const thumbnailDataUrl = await buildRealJpegDataUrl(1200, 900);
  const logoDataUrl = await buildRealJpegDataUrl(900, 900);
  const result = await upsertCatalogCategory(userId, {
    name: "Photobooth mariage",
    description: "Location de photobooth mariage avec impression instantanee.",
    meta_title: "Photobooth mariage - Location a Paris | Studio Demo",
    meta_description: "Location de photobooth mariage avec impression instantanee.",
    image_alt_text: "Photobooth mariage avec impression instantanee",
    image_uploads: [
      {
        data_url: thumbnailDataUrl,
        file_name: "photobooth-mariage.jpg",
        kind: "thumbnail",
        alt_text: "Photobooth mariage avec impression instantanee",
      },
      {
        data_url: logoDataUrl,
        file_name: "photobooth-mariage-logo.jpg",
        kind: "logo",
      },
    ],
  });

  assert.equal(result.imageUploadFailures.length, 0);
  assert.equal(result.category.meta_title, "Photobooth mariage - Location a Paris | Studio Demo");
  assert.equal(
    result.category.meta_description,
    "Location de photobooth mariage avec impression instantanee."
  );
  assert.match(result.category.logo_image_url, /^https:\/\/cdn\.lokify\.test\/categories\//);
  assert.equal(result.category.images.some((image) => image.kind === "logo"), true);
});

test("catalog category update replaces and deletes unused managed images", async () => {
  const userId = await getDemoUserId();
  const createdCategory = await upsertCatalogCategory(userId, {
    name: "Decoration scenique",
    image_alt_text: "Version initiale",
    image_uploads: [
      {
        data_url: await buildRealJpegDataUrl(1200, 900),
        file_name: "decoration-scene.jpg",
        kind: "thumbnail",
        alt_text: "Version initiale",
      },
    ],
  });
  const previousImageUrl = createdCategory.category.image_url;

  const updatedCategory = await upsertCatalogCategory(userId, {
    original_slug: createdCategory.category.slug,
    slug: createdCategory.category.slug,
    name: "Decoration scenique",
    image_alt_text: "Version remplacee",
    images: [],
    image_uploads: [
      {
        data_url: await buildRealJpegDataUrl(1280, 960),
        file_name: "decoration-scene-v2.jpg",
        kind: "thumbnail",
        alt_text: "Version remplacee",
      },
    ],
  });

  assert.equal(updatedCategory.imageUploadFailures.length, 0);
  assert.notEqual(updatedCategory.category.image_url, previousImageUrl);
  assert.deepEqual(deletedObjectKeys, [extractManagedObjectKey(previousImageUrl)]);
});

test("catalog category creation keeps the category when image upload fails", async () => {
  const userId = await getDemoUserId();
  failUploads = true;

  const result = await upsertCatalogCategory(userId, {
    name: "Structure temporaire",
    type: "Evenementiel",
    image_uploads: [
      {
        data_url: await buildRealJpegDataUrl(1200, 900),
        file_name: "structure-temporaire.jpg",
        kind: "thumbnail",
      },
    ],
  });

  assert.equal(result.imageUploadFailures.length, 1);
  assert.equal(result.category.slug, "structure-temporaire");
  assert.equal(result.category.image_url, "");
  assert.deepEqual(result.category.images, []);
});

test("item profiles are persisted independently from base items", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const relatedProductIds = (await getFirstItemIds(userId, 3))
    .filter((id) => id !== itemId)
    .slice(0, 2);

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

test("catalog product creation without image keeps photos empty", async () => {
  const userId = await getDemoUserId();
  const result = await createCatalogProduct(userId, {
    item: {
      name: "Ecran LED mobile",
      category: "Affichage",
      stock: 1,
      status: "available",
      price: 490,
      deposit: 900,
    },
    profile: {
      public_name: "Ecran LED mobile",
      public_description: "Affichage mobile sans image.",
      category_slug: "affichage",
      category_name: "Affichage",
      photos: [],
    },
    photo_uploads: [],
  });

  assert.equal(result.photoUploadFailures.length, 0);
  assert.deepEqual(result.itemProfile.photos, []);
});

test("catalog product creation with image stores only a public R2 URL in base", async () => {
  const userId = await getDemoUserId();
  const imageDataUrl = await buildRealJpegDataUrl(1200, 900);
  const result = await createCatalogProduct(userId, {
    item: {
      name: "Borne selfie studio",
      category: "Animation photo",
      stock: 2,
      status: "available",
      price: 320,
      deposit: 500,
    },
    profile: {
      public_name: "Borne selfie studio",
      public_description: "Pack catalogue avec photo hebergee.",
      category_slug: "animation-photo",
      category_name: "Animation photo",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: imageDataUrl,
        file_name: "borne-selfie.jpg",
      },
    ],
  });

  assert.equal(result.photoUploadFailures.length, 0);
  assert.equal(result.itemProfile.photos.length, 1);
  assert.match(result.itemProfile.photos[0], /^https:\/\/cdn\.lokify\.test\/products\//);
  assert.equal(uploadedObjectKeys.length, 1);

  const { rows } = await query("SELECT photos_json FROM item_profiles WHERE item_id = $1", [
    result.item.id,
  ]);
  const persistedPhotos = JSON.parse(rows[0].photos_json);

  assert.equal(persistedPhotos.length, 1);
  assert.equal(persistedPhotos[0].startsWith("data:image/"), false);
  assert.match(persistedPhotos[0], /^https:\/\/cdn\.lokify\.test\/products\//);
});

test("catalog product update replaces and deletes unused managed images", async () => {
  const userId = await getDemoUserId();
  const firstImage = await buildRealJpegDataUrl(1400, 1000);
  const createdProduct = await createCatalogProduct(userId, {
    item: {
      name: "Totem selfie",
      category: "Animation photo",
      stock: 1,
      status: "available",
      price: 280,
      deposit: 400,
    },
    profile: {
      public_name: "Totem selfie",
      public_description: "Version initiale.",
      category_slug: "animation-photo",
      category_name: "Animation photo",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: firstImage,
        file_name: "totem-selfie.jpg",
      },
    ],
  });
  const previousPhotoUrl = createdProduct.itemProfile.photos[0];
  const replacementImage = await buildRealJpegDataUrl(1280, 960);

  const updatedProduct = await updateCatalogProduct(userId, createdProduct.item.id, {
    item: {
      name: "Totem selfie",
      category: "Animation photo",
      stock: 1,
      status: "available",
      price: 280,
      deposit: 400,
    },
    profile: {
      public_name: "Totem selfie",
      public_description: "Version remplacee.",
      category_slug: "animation-photo",
      category_name: "Animation photo",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: replacementImage,
        file_name: "totem-selfie-v2.jpg",
      },
    ],
  });

  assert.equal(updatedProduct.photoUploadFailures.length, 0);
  assert.equal(updatedProduct.itemProfile.photos.length, 1);
  assert.notEqual(updatedProduct.itemProfile.photos[0], previousPhotoUrl);
  assert.deepEqual(deletedObjectKeys, [extractManagedObjectKey(previousPhotoUrl)]);
});

test("catalog product update keeps the requested image order across existing and new uploads", async () => {
  const userId = await getDemoUserId();
  const createdProduct = await createCatalogProduct(userId, {
    item: {
      name: "Totem selfie premium",
      category: "Animation photo",
      stock: 1,
      status: "available",
      price: 420,
      deposit: 500,
    },
    profile: {
      public_name: "Totem selfie premium",
      public_description: "Produit avec image principale changee.",
      category_slug: "animation-photo",
      category_name: "Animation photo",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: await buildRealJpegDataUrl(1400, 1000),
        file_name: "totem-selfie-premium.jpg",
      },
    ],
  });
  const previousPrimaryPhotoUrl = createdProduct.itemProfile.photos[0];

  const updatedProduct = await updateCatalogProduct(userId, createdProduct.item.id, {
    item: {
      name: "Totem selfie premium",
      category: "Animation photo",
      stock: 1,
      status: "available",
      price: 420,
      deposit: 500,
    },
    profile: {
      public_name: "Totem selfie premium",
      public_description: "Produit avec nouvelle image principale.",
      category_slug: "animation-photo",
      category_name: "Animation photo",
      photos: [previousPrimaryPhotoUrl],
    },
    photo_uploads: [
      {
        client_id: "new-primary",
        data_url: await buildRealJpegDataUrl(1280, 960),
        file_name: "totem-selfie-premium-main.jpg",
      },
    ],
    photo_sequence: ["upload:new-primary", previousPrimaryPhotoUrl],
  });

  assert.equal(updatedProduct.photoUploadFailures.length, 0);
  assert.equal(updatedProduct.itemProfile.photos.length, 2);
  assert.notEqual(updatedProduct.itemProfile.photos[0], previousPrimaryPhotoUrl);
  assert.equal(updatedProduct.itemProfile.photos[1], previousPrimaryPhotoUrl);
});

test("catalog product update deletes a removed managed image when it is no longer referenced", async () => {
  const userId = await getDemoUserId();
  const firstImage = await buildRealJpegDataUrl(1200, 900);
  const createdProduct = await createCatalogProduct(userId, {
    item: {
      name: "Fond photo premium",
      category: "Decoration",
      stock: 1,
      status: "available",
      price: 210,
      deposit: 300,
    },
    profile: {
      public_name: "Fond photo premium",
      public_description: "Produit avec image a supprimer.",
      category_slug: "decoration",
      category_name: "Decoration",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: firstImage,
        file_name: "fond-photo.jpg",
      },
    ],
  });
  const previousPhotoUrl = createdProduct.itemProfile.photos[0];

  const updatedProduct = await updateCatalogProduct(userId, createdProduct.item.id, {
    item: {
      name: "Fond photo premium",
      category: "Decoration",
      stock: 1,
      status: "available",
      price: 210,
      deposit: 300,
    },
    profile: {
      public_name: "Fond photo premium",
      public_description: "Produit sans image.",
      category_slug: "decoration",
      category_name: "Decoration",
      photos: [],
    },
    photo_uploads: [],
  });

  assert.equal(updatedProduct.photoUploadFailures.length, 0);
  assert.deepEqual(updatedProduct.itemProfile.photos, []);
  assert.deepEqual(deletedObjectKeys, [extractManagedObjectKey(previousPhotoUrl)]);
});

test("catalog product update keeps existing images when replacement upload fails", async () => {
  const userId = await getDemoUserId();
  const firstImage = await buildRealJpegDataUrl(1200, 900);
  const createdProduct = await createCatalogProduct(userId, {
    item: {
      name: "Mur de fleurs",
      category: "Decoration",
      stock: 1,
      status: "available",
      price: 600,
      deposit: 800,
    },
    profile: {
      public_name: "Mur de fleurs",
      public_description: "Version avec image initiale.",
      category_slug: "decoration",
      category_name: "Decoration",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: firstImage,
        file_name: "mur-fleurs.jpg",
      },
    ],
  });
  const originalPhotoUrl = createdProduct.itemProfile.photos[0];

  failUploads = true;

  const updatedProduct = await updateCatalogProduct(userId, createdProduct.item.id, {
    item: {
      name: "Mur de fleurs",
      category: "Decoration",
      stock: 1,
      status: "available",
      price: 600,
      deposit: 800,
    },
    profile: {
      public_name: "Mur de fleurs",
      public_description: "Tentative de remplacement.",
      category_slug: "decoration",
      category_name: "Decoration",
      photos: [],
    },
    photo_uploads: [
      {
        data_url: await buildRealJpegDataUrl(1300, 950),
        file_name: "mur-fleurs-v2.jpg",
      },
    ],
  });

  assert.equal(updatedProduct.photoUploadFailures.length, 1);
  assert.equal(updatedProduct.keptExistingPhotos, true);
  assert.deepEqual(updatedProduct.itemProfile.photos, [originalPhotoUrl]);
  assert.deepEqual(deletedObjectKeys, []);
});

test("catalog product images are appended through R2-backed storage", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const photoDataUrl = await buildRealJpegDataUrl(1200, 900);

  const profileWithPhoto = await appendItemProfilePhoto(userId, itemId, {
    data_url: photoDataUrl,
    file_name: "catalog-photo.jpg",
  });

  assert.equal(profileWithPhoto.photos.length >= 1, true);
  assert.match(profileWithPhoto.photos[0], /^https:\/\/cdn\.lokify\.test\/products\//);
});

test("catalog product images reject files smaller than the minimum dimensions", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);

  await assert.rejects(
    () =>
      appendItemProfilePhoto(userId, itemId, {
        data_url: buildPngDataUrl(300, 300),
      }),
    /L'image doit mesurer au moins 600 x 600 px\./
  );
});

test("catalog product images reject oversized payloads", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);

  await assert.rejects(
    () =>
      appendItemProfilePhoto(userId, itemId, {
        data_url: buildPngDataUrl(1600, 1200, 2 * 1024 * 1024 + 32),
      }),
    /L'image depasse la taille maximale autorisee de 2 Mo\./
  );
});

test("legacy data URL photos remain readable alongside new URL-based photos", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const legacyPhotoDataUrl = buildPngDataUrl(1200, 900);

  await upsertItemProfile(userId, itemId, {
    public_name: "Compatibilite legacy",
    photos: [legacyPhotoDataUrl],
  });

  const profiles = await listItemProfiles(userId);
  const updatedProfile = profiles.find((profile) => profile.item_id === itemId);

  assert.ok(updatedProfile);
  assert.deepEqual(updatedProfile.photos, [legacyPhotoDataUrl]);
});
