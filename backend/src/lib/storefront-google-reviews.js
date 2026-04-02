const GOOGLE_HOST_PATTERN = /(^|\.)google\.[a-z.]+$/i;
const URL_PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const GOOGLE_REVIEWS_ERROR_MESSAGES = {
  invalidUrl:
    "Ajoutez un lien Google Maps ou Google Business complet, par exemple https://www.google.com/maps/...",
  invalidDomain:
    "Le lien Avis Google doit provenir de Google Maps, Google Business ou g.page.",
  invalidTarget:
    "Ce lien Google n'est pas compatible. Utilisez un lien vers votre fiche Google Maps et ses avis.",
  writeReview:
    "Ce lien Google ouvre la redaction d'un avis. Utilisez plutot le lien public de votre fiche Google Maps.",
};

const ensureUrlProtocol = (value) =>
  URL_PROTOCOL_PATTERN.test(value) ? value : `https://${value}`;

const isGoogleReviewsHost = (hostname) =>
  hostname === "g.page" ||
  hostname.endsWith(".g.page") ||
  hostname === "maps.app.goo.gl" ||
  GOOGLE_HOST_PATTERN.test(hostname);

const getPathSegments = (pathname) =>
  String(pathname || "")
    .toLowerCase()
    .split("/")
    .filter(Boolean);

const isGoogleWriteReviewLink = (parsedUrl) => {
  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();
  const pathSegments = getPathSegments(pathname);

  if (pathname.includes("writereview")) {
    return true;
  }

  return (
    (hostname === "g.page" || hostname.endsWith(".g.page")) &&
    pathSegments[0] === "r" &&
    pathSegments[pathSegments.length - 1] === "review"
  );
};

const isCompatibleGoogleReviewsTarget = (parsedUrl) => {
  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  if (hostname === "maps.app.goo.gl") {
    return true;
  }

  if (hostname === "g.page" || hostname.endsWith(".g.page")) {
    return getPathSegments(pathname).length > 0;
  }

  if (
    pathname.startsWith("/maps") ||
    pathname.startsWith("/place") ||
    pathname.startsWith("/localservices") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/business") ||
    pathname.includes("/maps/") ||
    pathname.includes("/place/")
  ) {
    return true;
  }

  if (
    parsedUrl.searchParams.has("query") ||
    parsedUrl.searchParams.has("cid") ||
    parsedUrl.searchParams.has("placeid") ||
    parsedUrl.searchParams.has("ftid") ||
    parsedUrl.searchParams.has("ludocid")
  ) {
    return true;
  }

  return parsedUrl.hash.toLowerCase().includes("lrd=");
};

export const validateStorefrontGoogleReviewsUrl = (value) => {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return {
      isEmpty: true,
      isValid: false,
      normalizedUrl: null,
      error: "",
    };
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(ensureUrlProtocol(rawValue));
  } catch (_error) {
    return {
      isEmpty: false,
      isValid: false,
      normalizedUrl: null,
      error: GOOGLE_REVIEWS_ERROR_MESSAGES.invalidUrl,
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      isEmpty: false,
      isValid: false,
      normalizedUrl: null,
      error: GOOGLE_REVIEWS_ERROR_MESSAGES.invalidUrl,
    };
  }

  if (!isGoogleReviewsHost(parsedUrl.hostname.toLowerCase())) {
    return {
      isEmpty: false,
      isValid: false,
      normalizedUrl: null,
      error: GOOGLE_REVIEWS_ERROR_MESSAGES.invalidDomain,
    };
  }

  if (isGoogleWriteReviewLink(parsedUrl)) {
    return {
      isEmpty: false,
      isValid: false,
      normalizedUrl: null,
      error: GOOGLE_REVIEWS_ERROR_MESSAGES.writeReview,
    };
  }

  if (!isCompatibleGoogleReviewsTarget(parsedUrl)) {
    return {
      isEmpty: false,
      isValid: false,
      normalizedUrl: null,
      error: GOOGLE_REVIEWS_ERROR_MESSAGES.invalidTarget,
    };
  }

  return {
    isEmpty: false,
    isValid: true,
    normalizedUrl: parsedUrl.toString(),
    error: "",
  };
};
