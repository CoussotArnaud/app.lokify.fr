const CLIENT_PROFILE_KEY = "lokify_client_profiles";
const PRODUCT_PROFILE_KEY = "lokify_product_profiles";
const CUSTOM_CATEGORY_KEY = "lokify_custom_categories";

const isBrowser = () => typeof window !== "undefined";

const readJson = (key, fallback) => {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (!isBrowser()) {
    return value;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  return value;
};

export const slugifyLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const readClientProfiles = () => readJson(CLIENT_PROFILE_KEY, {});

export const saveClientProfile = (clientId, profile) => {
  const currentProfiles = readClientProfiles();
  const nextProfiles = {
    ...currentProfiles,
    [clientId]: profile,
  };

  return writeJson(CLIENT_PROFILE_KEY, nextProfiles);
};

export const readProductProfiles = () => readJson(PRODUCT_PROFILE_KEY, {});

export const saveProductProfile = (productId, profile) => {
  const currentProfiles = readProductProfiles();
  const nextProfiles = {
    ...currentProfiles,
    [productId]: profile,
  };

  return writeJson(PRODUCT_PROFILE_KEY, nextProfiles);
};

export const readCustomCategories = () => readJson(CUSTOM_CATEGORY_KEY, []);

export const saveCustomCategory = (category) => {
  const currentCategories = readCustomCategories();
  const nextCategory = {
    ...category,
    id: category.id || slugifyLabel(category.name),
    slug: category.slug || slugifyLabel(category.name),
  };
  const nextCategories = [
    ...currentCategories.filter((entry) => entry.slug !== nextCategory.slug),
    nextCategory,
  ].sort((left, right) => left.name.localeCompare(right.name, "fr"));

  return writeJson(CUSTOM_CATEGORY_KEY, nextCategories);
};

export const removeCustomCategory = (categorySlug) => {
  const nextCategories = readCustomCategories().filter((entry) => entry.slug !== categorySlug);
  return writeJson(CUSTOM_CATEGORY_KEY, nextCategories);
};
