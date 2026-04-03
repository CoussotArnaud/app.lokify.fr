import { API_URL } from "./api";

const managedStorefrontHeroPathPattern = /\/storefronts\//i;

export const normalizeStorefrontHeroImageUrls = (source) => {
  const candidateLists = [];

  if (Array.isArray(source)) {
    candidateLists.push(source);
  }

  if (source && typeof source === "object" && !Array.isArray(source)) {
    candidateLists.push(source.hero_images);
    candidateLists.push(source.hero_image_urls);

    if (source.storefront && typeof source.storefront === "object") {
      candidateLists.push(source.storefront.hero_images);
      candidateLists.push(source.storefront.hero_image_urls);
    }
  }

  const urls = [];
  const seen = new Set();

  candidateLists.forEach((entries) => {
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const resolvedUrl =
        entry && typeof entry === "object" && !Array.isArray(entry) ? entry.url : entry;
      const normalizedUrl = String(resolvedUrl || "").trim();

      if (!normalizedUrl || seen.has(normalizedUrl)) {
        return;
      }

      seen.add(normalizedUrl);
      urls.push(normalizedUrl);
    });
  });

  return urls;
};

export const buildStorefrontHeroImageDisplayUrl = (sourceUrl) => {
  const normalizedUrl = String(sourceUrl || "").trim();

  if (!normalizedUrl) {
    return "";
  }

  if (/^\/?api\/public\/storefront\/hero-images/i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  try {
    const candidateUrl = new URL(normalizedUrl);

    if (!/^https?:$/i.test(candidateUrl.protocol) || !managedStorefrontHeroPathPattern.test(candidateUrl.pathname)) {
      return normalizedUrl;
    }

    return `${API_URL}/public/storefront/hero-images?src=${encodeURIComponent(normalizedUrl)}`;
  } catch (_error) {
    return normalizedUrl;
  }
};
