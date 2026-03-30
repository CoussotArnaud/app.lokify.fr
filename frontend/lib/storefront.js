const normalizeSlug = (value) => String(value || "").trim();

export const buildStorefrontPath = (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  return normalizedSlug ? `/shop/${encodeURIComponent(normalizedSlug)}` : "/shop";
};

export const buildStorefrontUrl = (slug, origin = "") => {
  const path = buildStorefrontPath(slug);
  return origin ? `${String(origin).replace(/\/+$/, "")}${path}` : path;
};
